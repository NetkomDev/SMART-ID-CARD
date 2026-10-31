import { QRCamera, bindLoginCamera } from "../../shared/qr-camera";
import { renderPortrait } from "../../shared/portrait";
import { gateIntro, gateHelp } from "../../shared/portal-ui";
import { NaturalVoice } from "../../shared/natural-voice";
import "./style.css";
import "../../shared/scanner.css";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";

const portal = new PortalSession("LIBRARY_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Perpustakaan", import.meta.env.BASE_URL, import.meta.env.PROD);

const speaker = new NaturalVoice("perpustakaan", ({ enabled, text }) => {
  const toggle = document.getElementById("voice-toggle") as HTMLButtonElement | null;
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.textContent = enabled ? "🔊 Suara aktif" : "🔇 Nonaktif";
  }
  const testBtn = document.getElementById("voice-test") as HTMLButtonElement | null;
  if (testBtn) testBtn.disabled = !enabled;
  const statusEl = document.getElementById("voice-status");
  if (statusEl) statusEl.textContent = text;
});
document.getElementById("voice-toggle")?.addEventListener("click", () => {
  speaker.setEnabled(!speaker.enabled);
});
document.getElementById("voice-test")?.addEventListener("click", () => {
  speaker.unlock();
  speaker.speak("Suara siap digunakan");
});
try { for (const key of Object.keys(localStorage)) if (key.startsWith("library_cache_")) localStorage.removeItem(key); } catch { /* Historical profile cache is no longer used. */ }
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

const login = document.getElementById("view-login")!;
const loginForm = document.getElementById("form-login") as HTMLFormElement;
login.classList.add("portal-gate");
login.insertAdjacentHTML("afterbegin", gateIntro("Layanan Perpustakaan", "Akses layanan perpustakaan sekolah melalui akses resmi dari admin."));
loginForm.insertAdjacentHTML("beforeend", gateHelp);

bindLoginCamera(import.meta.env.BASE_URL);

let syncing: Promise<void> | null = null;
type LibrarySummary = { class_id: string | null; class_name: string; total: number };
const dayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};
let summaryVersion=0;
async function loadDailySummary() {
  const revision=++summaryVersion;
  const { start, end } = dayRange();
  try {
    const rows = await portal.request<LibrarySummary[]>(`/library/summary?occurred_from=${encodeURIComponent(start)}&occurred_to=${encodeURIComponent(end)}`);
    if(revision!==summaryVersion)return;
    todayVisits.textContent = String(rows.reduce((total, row) => total + row.total, 0));
    activeClasses.textContent = String(rows.filter(row => row.total > 0).length);
  } catch {
    if(revision!==summaryVersion)return;
    todayVisits.textContent = "—";
    activeClasses.textContent = "—";
  }
}
async function sync() {
  if (syncing) return syncing;
  const work = async () => {
    const key = queueKey();
    let failed = 0;
    for (const visit of queue(key)) {
      try {
        await portal.request("/library/visits", { method: "POST", body: JSON.stringify(visit) });
        save(queue(key).filter(item => item.event_id !== visit.event_id), key);
      } catch(error) {
        if (error instanceof PortalError && [400,403,404,409,422].includes(error.status)) {
          const failedKey = `${key}.failed`;
          const prior = JSON.parse(localStorage.getItem(failedKey) ?? "[]");
          localStorage.setItem(failedKey, JSON.stringify([...prior, {event:visit,code:error.code,failed_at:new Date().toISOString()}]));
          save(queue(key).filter(item => item.event_id !== visit.event_id), key); failed++;
        } else throw error;
      }
    }
    status.value = failed ? `${failed} kunjungan memerlukan rekonsiliasi; kunjungan lain disinkronisasi.` : "Semua kunjungan tersinkronisasi";
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
    if (!isScanning) {
      document.getElementById("card")?.focus();
    }
    if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = undefined; }
  } else if (view === "success") {
    document.getElementById("view-success")!.style.display = "flex";
  }
}
document.getElementById("btn-next-scan")?.addEventListener("click", () => switchView("scan"));

let visitBusy = false;
async function processVisit(uid: string, isFromCamera: boolean = false) {
  if (visitBusy) return;
  visitBusy = true;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submit.disabled = true;
  status.value = "Menyimpan kunjungan…";
  const key = queueKey();
  const visit: Visit = { event_id: crypto.randomUUID(), card_uid: uid, occurred_at: new Date().toISOString(), local_sequence: Date.now(), metadata: { terminal: "library-pwa" } };
  
  // 2. SLOW PATH (Network)
  if (isFromCamera) {
    triggerHapticFeedback();
    const flash = document.getElementById("camera-shutter-flash");
    if (flash) {
      flash.classList.remove("flash-active");
      void flash.offsetWidth;
      flash.classList.add("flash-active");
    }
  }

  try {
    const result = await portal.request<{student_name?:string;class_name?:string;duplicate?:boolean;photo_url?:string}>("/library/visits", { method: "POST", body: JSON.stringify(visit) });
    if (isFromCamera) showLoadingOverlay(false);
    
    document.getElementById("success-student-name")!.textContent = result.student_name ?? "Siswa";
    document.getElementById("success-student-class")!.textContent = result.class_name ?? "—";
    
    const visitTimeText = `${result.duplicate ? "Sudah tercatat" : "Tercatat"} pukul ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
    document.getElementById("success-visit-time")!.textContent = visitTimeText;
    
    const dupEl = document.getElementById("duplicate-warning");
    if (dupEl) dupEl.style.display = result.duplicate ? "block" : "none";

    const avatarEl = document.getElementById("student-avatar");
    if (avatarEl) {
      if (result.photo_url) {
        renderPortrait(avatarEl, result.photo_url);
      } else {
        avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
      }
    }

    if (result.duplicate) {
      speaker.speak(`${result.student_name ?? "Siswa"}, sudah tercatat`);
    } else {
      speaker.speak(`Selamat datang, ${result.student_name ?? "Siswa"}`);
    }
    
    status.value = result.duplicate ? "Kunjungan sudah tercatat." : "Kunjungan berhasil disimpan.";
    switchView("success");
    void loadDailySummary();
    if (!isFromCamera) triggerHapticFeedback();
    
    // Auto-return to scan after 1.8 seconds to keep line moving fast
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = window.setTimeout(() => switchView("scan"), 1800);

  } catch (error) {
    if (isFromCamera) showLoadingOverlay(false);
    
    if (error instanceof PortalError && error.status < 500) {
      if (error.status === 400 || error.status === 404) {
        document.getElementById("error-overlay-msg")!.textContent = error.message;
        document.getElementById("error-overlay")!.style.display = "flex";
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Error haptic pattern
      } else {
        status.value = error.message;
      }
      return;
    }
    
    save([...queue(key), visit], key); 
    speaker.speak("Kunjungan disimpan offline");
    status.value = "Koneksi tertunda — kunjungan tersimpan di perangkat";
  } finally {
    visitBusy = false; submit.disabled = false;
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

let isScanning = false;
let currentZoom = 1;
let initialTouchDistance = 0;
let initialZoomOnTouch = 1;

async function setCameraZoom(value:number) {currentZoom=value;await camera.setZoom(value);}

function setupScannerPinchZoom() {
  const stage = document.querySelector<HTMLElement>(".scanner-viewport");
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

const camera = new QRCamera({readerId:"qr-reader",toggleId:"btn-toggle-camera",stageId:"scanner-stage",placeholderId:"scanner-placeholder",statusId:"scan-status",errorId:"status",zoomId:"zoom-controls",once:false,canRead:()=>!visitBusy && document.getElementById("view-success")!.style.display!=="flex" && document.getElementById("error-overlay")!.style.display!=="flex",onState:phase=>{isScanning=phase==="active";},onDecode:async value=>{await processVisit(value,true);}});
async function stopCameraScanner(){await camera.stop();currentZoom=1;}
async function startCameraScanner(){await camera.start();}
document.getElementById("btn-switch-camera")!.addEventListener("click",()=>{void camera.flip();});
document.addEventListener("visibilitychange",()=>{if(document.hidden)void stopCameraScanner();});
window.addEventListener("pagehide",()=>{void stopCameraScanner();});

document.getElementById("btn-toggle-camera")!.addEventListener("click", () => {
  if (isScanning) stopCameraScanner();
  else startCameraScanner();
});

async function start() {
  try {
    const isLoginFlow = new URL(window.location.href).searchParams.has("token") || new URL(window.location.href).hash.includes("token");

    if (portal.connected && !isLoginFlow) {
      panel.hidden = false;
      login.style.display = "none";
      const libSchool = document.querySelector("#library-school");
      if (libSchool && portal.context) libSchool.textContent = portal.context.school_name;
      queued.textContent = String(queue().length); 
      offerInstall();
      
      await Promise.all([
        portal.start(),
        loadDailySummary()
      ]);
      
      if (libSchool && portal.context) libSchool.textContent = portal.context.school_name;
      if (queue().length) void sync().catch(showError);
      return;
    }

    if (!await portal.start()) {
      panel.hidden = true;
      login.style.display = "block";
      return;
    }
    panel.hidden = false;
    login.style.display = "none";
    const libSchool = document.querySelector("#library-school");
    if (libSchool) libSchool.textContent = portal.context!.school_name;
    queued.textContent = String(queue().length); offerInstall();
    void loadDailySummary();
    if (queue().length) void sync().catch(showError);
  } catch (error) {
    panel.hidden = true;
    login.style.display = "block";
    document.getElementById("login-error")!.textContent = error instanceof Error ? error.message : "Belum dapat terhubung.";
  }
}

void start();
