import { gateIntro, gateHelp } from "../../shared/portal-ui";
import "./style.css";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
const portal = new PortalSession("LIBRARY_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Perpustakaan", import.meta.env.BASE_URL, import.meta.env.PROD);
type Visit = { event_id: string; card_uid: string; occurred_at: string; local_sequence: number; metadata: Record<string, unknown> };
const form = document.querySelector<HTMLFormElement>("#scan")!;
const card = document.querySelector<HTMLInputElement>("#card")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
const queued = document.querySelector("#queued")!;
const studentResult = document.querySelector<HTMLElement>("#student-result")!;
const studentName = document.querySelector<HTMLElement>("#student-name")!;
const visitTime = document.querySelector<HTMLElement>("#visit-time")!;
const todayVisits = document.querySelector<HTMLElement>("#today-visits")!;
const activeClasses = document.querySelector<HTMLElement>("#active-classes")!;

const panel = document.getElementById("panel")!;
const queueKey = () => `aksis.library.queue.${portal.context?.id ?? "none"}`;
function queue(key = queueKey()): Visit[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as Visit[]; } catch { return []; }
}
function save(items: Visit[], key = queueKey()) { localStorage.setItem(key, JSON.stringify(items)); queued.textContent = String(items.length); }
let syncing: Promise<void> | null = null;
type LibrarySummary = { class_id: string | null; class_name: string; total: number };
const dayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};
async function loadDailySummary() {
  const { start, end } = dayRange();
  try {
    const rows = await portal.request<LibrarySummary[]>(`/library/summary?occurred_from=${encodeURIComponent(start)}&occurred_to=${encodeURIComponent(end)}`);
    todayVisits.textContent = String(rows.reduce((total, row) => total + row.total, 0));
    activeClasses.textContent = String(rows.filter(row => row.total > 0).length);
  } catch {
    todayVisits.textContent = "—";
    activeClasses.textContent = "—";
  }
}
async function sync() {
  if (syncing) return syncing;
  const work = async () => {
    const key = queueKey();
    for (const visit of queue(key)) {
      await portal.request("/library/visits", { method: "POST", body: JSON.stringify(visit) });
      // Remove only acknowledged IDs; scans added during the request remain queued.
      save(queue(key).filter(item => item.event_id !== visit.event_id), key);
    }
    status.value = "Semua kunjungan tersinkronisasi";
    await loadDailySummary();
  };
  syncing = Promise.resolve(navigator.locks ? navigator.locks.request(queueKey(), work) : work()).then(() => undefined).finally(() => { syncing = null; });
  return syncing;
}
function showLoadingOverlay(show: boolean) {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.style.display = show ? "flex" : "none";
}

let scanTimeout: number | undefined;
function switchView(view: "scan" | "success") {
  if (view === "scan") {
    document.getElementById("view-success")!.style.display = "none";
    document.getElementById("card")?.focus();
    if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = undefined; }
  } else if (view === "success") {
    document.getElementById("view-success")!.style.display = "flex";
  }
}
document.getElementById("btn-next-scan")?.addEventListener("click", () => switchView("scan"));

async function processVisit(uid: string, isFromCamera: boolean = false) {
  const key = queueKey();
  const cacheKey = `library_cache_${portal.context?.id ?? "none"}_${uid}`;
  const visit: Visit = { event_id: crypto.randomUUID(), card_uid: uid, occurred_at: new Date().toISOString(), local_sequence: Date.now(), metadata: { terminal: "library-pwa" } };
  
  // 1. FAST PATH (Optimistic UI)
  const cachedStr = localStorage.getItem(cacheKey);
  if (cachedStr) {
    try {
      const cached = JSON.parse(cachedStr);
      
      if (isFromCamera) {
        triggerHapticFeedback();
        const flash = document.getElementById("camera-shutter-flash");
        if (flash) {
          flash.classList.remove("flash-active");
          void flash.offsetWidth;
          flash.classList.add("flash-active");
        }
      }
      
      document.getElementById("success-student-name")!.textContent = cached.student_name ?? "Siswa";
      document.getElementById("success-student-class")!.textContent = cached.class_name ?? "—";
      document.getElementById("success-visit-time")!.textContent = `Tercatat pukul ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
      
      const dupEl = document.getElementById("duplicate-warning");
      if (dupEl) dupEl.style.display = "none";

      const avatarEl = document.getElementById("student-avatar");
      if (avatarEl) {
        if (cached.photo_url) {
          avatarEl.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background-image:url('${cached.photo_url}');background-size:cover;background-position:center;"></div>`;
        } else {
          avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
        }
      }
      
      switchView("success");
      if (!isFromCamera) triggerHapticFeedback();
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = window.setTimeout(() => switchView("scan"), 5000);
      
      // Fire background request silently
      portal.request<{duplicate?:boolean}>("/library/visits", { method: "POST", body: JSON.stringify(visit) })
        .then((res) => {
          if (res.duplicate && dupEl) dupEl.style.display = "block";
          void loadDailySummary();
        })
        .catch(err => {
          if (err instanceof PortalError && err.status < 500) return;
          save([...queue(key), visit], key);
          status.value = "Koneksi tertunda — kunjungan tersimpan di perangkat";
        });
        
      return; // Fast path done
    } catch (e) {}
  }

  // 2. SLOW PATH (Network)
  if (isFromCamera) {
    triggerHapticFeedback();
    const flash = document.getElementById("camera-shutter-flash");
    if (flash) {
      flash.classList.remove("flash-active");
      void flash.offsetWidth;
      flash.classList.add("flash-active");
    }
    showLoadingOverlay(true);
  }

  try {
    const result = await portal.request<{student_name?:string;class_name?:string;duplicate?:boolean;photo_url?:string}>("/library/visits", { method: "POST", body: JSON.stringify(visit) });
    if (isFromCamera) showLoadingOverlay(false);
    
    // Save to Cache
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        student_name: result.student_name,
        class_name: result.class_name,
        photo_url: result.photo_url
      }));
    } catch (e) {}
    
    document.getElementById("success-student-name")!.textContent = result.student_name ?? "Siswa";
    document.getElementById("success-student-class")!.textContent = result.class_name ?? "—";
    
    const visitTimeText = `${result.duplicate ? "Sudah tercatat" : "Tercatat"} pukul ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    document.getElementById("success-visit-time")!.textContent = visitTimeText;
    
    const dupEl = document.getElementById("duplicate-warning");
    if (dupEl) dupEl.style.display = result.duplicate ? "block" : "none";

    const avatarEl = document.getElementById("student-avatar");
    if (avatarEl) {
      if (result.photo_url) {
        avatarEl.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background-image:url('${result.photo_url}');background-size:cover;background-position:center;"></div>`;
      } else {
        avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
      }
    }
    
    switchView("success");
    void loadDailySummary();
    if (!isFromCamera) triggerHapticFeedback();
    
    // Auto-return to scan after 5 seconds
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = window.setTimeout(() => switchView("scan"), 5000);

  } catch (error) {
    if (isFromCamera) showLoadingOverlay(false);
    if (error instanceof PortalError && error.status < 500) { status.value = error.message; return; }
    save([...queue(key), visit], key); status.value = "Koneksi tertunda — kunjungan tersimpan di perangkat";
  }
}

form.onsubmit = async event => {
  event.preventDefault();
  const uid = card.value.trim();
  if (!uid) return;
  await processVisit(uid, false);
  card.value = "";
};
const showError = (error: unknown) => {
  status.value = error instanceof Error ? error.message : "Sinkronisasi tertunda";
  status.className = "error";
};

let globalAudioCtx: AudioContext | null = null;
function initAudio() {
  if (!globalAudioCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) globalAudioCtx = new AudioCtx();
  }
  if (globalAudioCtx && globalAudioCtx.state === "suspended") {
    void globalAudioCtx.resume();
  }
}
document.addEventListener("pointerdown", initAudio, { once: true, passive: true });
document.addEventListener("touchstart", initAudio, { once: true, passive: true });
document.addEventListener("keydown", initAudio, { once: true, passive: true });

function triggerHapticFeedback() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(200);
    } catch {}
  }
  try {
    if (globalAudioCtx) {
      if (globalAudioCtx.state === "suspended") {
        void globalAudioCtx.resume();
      }
      const osc = globalAudioCtx.createOscillator();
      const gain = globalAudioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(960, globalAudioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, globalAudioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, globalAudioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(globalAudioCtx.destination);
      osc.start();
      osc.stop(globalAudioCtx.currentTime + 0.15);
    }
  } catch {}
}

document.querySelector<HTMLButtonElement>("#sync")!.onclick = () => void sync().catch(showError);
window.addEventListener("online", () => { if (portal.connected) void sync().catch(showError); });

let html5QrCode: any = null;
let isScanning = false;
let currentZoom = 1;
let initialTouchDistance = 0;
let initialZoomOnTouch = 1;

function getActiveCameraTrack(): MediaStreamTrack | null {
  const videoEl = document.querySelector<HTMLVideoElement>("#qr-reader video");
  if (!videoEl || !videoEl.srcObject) return null;
  const stream = videoEl.srcObject as MediaStream;
  const tracks = stream.getVideoTracks();
  return tracks[0] ?? null;
}

async function setCameraZoom(zoomLevel: number) {
  currentZoom = Math.max(1, Math.min(5, zoomLevel));
  const track = getActiveCameraTrack();
  if (track) {
    try {
      const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
      if (caps.zoom) {
        const min = caps.zoom.min || 1;
        const max = caps.zoom.max || 5;
        const targetZoom = Math.max(min, Math.min(max, currentZoom));
        await track.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
      }
    } catch { /* Hardware zoom fallback to CSS scale below */ }
  }

  const qrContainer = document.getElementById("qr-reader");
  if (qrContainer) {
    const mediaEls = qrContainer.querySelectorAll<HTMLVideoElement | HTMLCanvasElement>("video, canvas");
    mediaEls.forEach(media => {
      media.style.transform = currentZoom > 1 ? `scale(${currentZoom.toFixed(2)})` : "none";
      media.style.transformOrigin = "center center";
      media.style.transition = "transform 0.12s ease-out";
    });
  }

  const zoomBox = document.getElementById("zoom-controls");
  if (zoomBox) {
    zoomBox.querySelectorAll<HTMLButtonElement>(".zoom-btn").forEach(btn => {
      const val = Number(btn.getAttribute("data-zoom"));
      btn.classList.toggle("active", Math.abs(val - currentZoom) < 0.3);
    });
  }
}

function setupScannerPinchZoom() {
  const stage = document.querySelector(".scanner-stage");
  if (!stage) return;

  const handleTouchStart = (e: TouchEvent) => {
    const target = e.target as HTMLElement | null;
    const isInside = target && (stage.contains(target) || !!target.closest(".scanner-stage, #qr-reader"));
    if (isInside && e.touches.length === 2 && isScanning) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      initialTouchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      initialZoomOnTouch = currentZoom;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && isScanning && initialTouchDistance > 0) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const zoomFactor = currentDistance / initialTouchDistance;
      const newZoom = initialZoomOnTouch * zoomFactor;
      void setCameraZoom(newZoom);
    }
  };

  const handleTouchEnd = () => { initialTouchDistance = 0; };

  document.addEventListener("touchstart", handleTouchStart, { passive: false });
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });
  document.addEventListener("touchcancel", handleTouchEnd, { passive: true });
}

document.querySelectorAll<HTMLButtonElement>(".zoom-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const zoomVal = Number(btn.getAttribute("data-zoom")) || 1;
    void setCameraZoom(zoomVal);
  });
});

setupScannerPinchZoom();

async function stopCameraScanner() {
  if (html5QrCode && isScanning) {
    try { await html5QrCode.stop(); } catch (e) {}
    isScanning = false;
    currentZoom = 1;
    document.getElementById("qr-reader")!.style.display = "none";
    document.getElementById("zoom-controls")!.style.display = "none";
    const ph = document.getElementById("scanner-placeholder");
    if (ph) ph.style.display = "block";
    document.getElementById("btn-toggle-camera")!.textContent = "Buka Kamera Scanner";
  }
}

async function startCameraScanner() {
  if (!html5QrCode) {
    const { Html5Qrcode } = await import("html5-qrcode");
    html5QrCode = new Html5Qrcode("qr-reader");
  }
  try {
    const ph = document.getElementById("scanner-placeholder");
    if (ph) ph.style.display = "none";
    document.getElementById("qr-reader")!.style.display = "block";
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      let lastScannedText = "";
      let lastScannedTime = 0;
      
      const onScanSuccess = async (decodedText: string) => {
        // Prevent rapid duplicate scans of the same code within 5 seconds
        const now = Date.now();
        if (decodedText === lastScannedText && (now - lastScannedTime) < 5000) {
          return;
        }
        lastScannedText = decodedText;
        lastScannedTime = now;
        
        // Prevent scanning if success overlay or loading is visible
        if (document.getElementById("view-success")?.style.display === "flex" || 
            document.getElementById("loading-overlay")?.style.display === "flex") {
          return;
        }

        try {
          const url = new URL(decodedText);
          if (url.hash.includes("token=") || url.searchParams.has("token")) {
            await stopCameraScanner();
            window.location.href = decodedText;
            return;
          }
        } catch {}
  
        void processVisit(decodedText, true);
      };

    try {
      await html5QrCode.start({ facingMode: { exact: "environment" } }, config, onScanSuccess, () => {});
    } catch (e) {
      await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
    }

    isScanning = true;
    document.getElementById("btn-toggle-camera")!.textContent = "Tutup Kamera";
    document.getElementById("zoom-controls")!.style.display = "flex";
    void setCameraZoom(1);
  } catch (err) {
    status.value = "Kamera tidak dapat diakses atau tidak ditemukan.";
    status.className = "error";
    document.getElementById("qr-reader")!.style.display = "none";
    const ph = document.getElementById("scanner-placeholder");
    if (ph) ph.style.display = "block";
  }
}

document.getElementById("btn-toggle-camera")!.addEventListener("click", () => {
  if (isScanning) stopCameraScanner();
  else startCameraScanner();
});

async function start() {
  panel.hidden = false;
  try {
    if (!await portal.start()) {
      status.value = "Silakan pindai QR login dari admin sekolah untuk mulai menggunakan terminal.";
      void startCameraScanner();
      return;
    }
    const libSchool = document.querySelector("#library-school");
    if (libSchool) libSchool.textContent = portal.context!.school_name;
    queued.textContent = String(queue().length); offerInstall();
    void loadDailySummary();
    if (queue().length) void sync().catch(showError);
  } catch (error) {
    status.value = error instanceof Error ? error.message : "Belum dapat terhubung.";
    status.className = "error";
  }
}

void start();
