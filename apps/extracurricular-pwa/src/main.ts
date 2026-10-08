import { gateIntro, gateHelp, schoolLabel } from "../../shared/portal-ui";

import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
import "./style.css";

const portal = new PortalSession("TEACHER", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Ekstrakurikuler", import.meta.env.BASE_URL, import.meta.env.PROD);

const entry = document.getElementById("view-login")!;
const accessForm = document.getElementById('form-login')!;
// Hapus gateIntro agar tidak muncul halaman "Portal Sekolah..."
// entry.innerHTML = gateIntro('Kegiatan & presensi', 'Kelola kehadiran kegiatan siswa melalui akses yang diberikan Admin Sekolah.');
// entry.append(accessForm); entry.insertAdjacentHTML('beforeend', gateHelp);
const views = {
  login: document.getElementById("view-login")!,
  dashboard: document.getElementById("view-dashboard")!,
  scan: document.getElementById("view-scan")!,
  attendance: document.getElementById("view-attendance")!
};

let scanTimeout: number | undefined;

let currentEkskulId = "";
let currentSessionId = "";
let pendingStudent: { id: string; full_name: string; photo_url?: string | null } | null = null;
let enrollmentKey = "";
let selecting = false, submitting = false;
type SessionSummary = { total: number; present: number; excused: number; absent: number };

async function loadSessionSummary() {
  if (!currentEkskulId || !currentSessionId) return;
  try {
    const summary = await request<SessionSummary>(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/summary`);
    document.getElementById("session-present")!.textContent = String(summary.present);
    document.getElementById("session-excused")!.textContent = String(summary.excused);
    document.getElementById("session-total")!.textContent = String(summary.total);
  } catch {
    document.getElementById("session-present")!.textContent = "—";
    document.getElementById("session-excused")!.textContent = "—";
    document.getElementById("session-total")!.textContent = "—";
  }
}

let loginScanner: any = null;
document.getElementById("btn-start-login-scan")?.addEventListener("click", async () => {
  document.getElementById("btn-start-login-scan")!.style.display = "none";
  document.getElementById("btn-login-retry")!.style.display = "none";
  document.getElementById("login-scanner-container")!.style.display = "block";
  try {
    if (!loginScanner) {
      const { Html5Qrcode } = await import("html5-qrcode");
      loginScanner = new Html5Qrcode("login-qr-reader");
    }
    await loginScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: (w: number, h: number) => ({ width: Math.min(250, w * .8, h * .8), height: Math.min(250, w * .8, h * .8) }) }, (decoded: string) => {
      try {
        const url = new URL(decoded);
        if (url.hash.includes("token=") || url.searchParams.has("token")) {
          void loginScanner?.stop().catch(() => {});
          window.location.href = decoded;
        }
      } catch { /* ignore invalid URLs */ }
    }, () => undefined);
  } catch (error) {
    document.getElementById("login-error")!.textContent = "Kamera tidak dapat diakses untuk memindai QR.";
    document.getElementById("login-scanner-container")!.style.display = "none";
    document.getElementById("btn-start-login-scan")!.style.display = "block";
  }
});
document.getElementById("btn-cancel-login-scan")?.addEventListener("click", async () => {
  if (loginScanner) { try { await loginScanner.stop(); } catch {} }
  document.getElementById("login-scanner-container")!.style.display = "none";
  document.getElementById("btn-start-login-scan")!.style.display = "block";
});

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
  const stage = document.querySelector(".scanner-card");
  if (!stage) return;

  const handleTouchStart = (e: TouchEvent) => {
    const target = e.target as HTMLElement | null;
    const isInside = target && (stage.contains(target) || !!target.closest(".scanner-card, #qr-reader"));
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
    const onScanSuccess = async (decodedText: string) => {
      triggerHapticFeedback();
      const flash = document.getElementById("camera-shutter-flash");
      if (flash) {
        flash.classList.remove("flash-active");
        void flash.offsetWidth;
        flash.classList.add("flash-active");
      }
      
      const input = document.getElementById("scan-input") as HTMLInputElement;
      input.value = decodedText;
      await stopCameraScanner();
      document.getElementById("form-scan")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
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
  } catch (err: any) {
    document.getElementById("scan-error")!.textContent = !window.isSecureContext
      ? "Kamera diblokir browser karena diakses via HTTP (bukan localhost/HTTPS)."
      : "Kamera tidak dapat diakses (izin ditolak atau tidak ditemukan).";
    document.getElementById("qr-reader")!.style.display = "none";
    const ph = document.getElementById("scanner-placeholder");
    if (ph) ph.style.display = "block";
  }
}

document.getElementById("btn-toggle-camera")?.addEventListener("click", () => {
  if (isScanning) stopCameraScanner();
  else startCameraScanner();
});

function switchView(viewName: keyof typeof views) {
  if (viewName !== "scan") { stopCameraScanner(); }
  Object.values(views).forEach(v => v.style.display = "none");
  views[viewName].style.display = "block";
  if (viewName === "scan") {
    if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = undefined; }
  }
}

document.getElementById("btn-next-scan")?.addEventListener("click", () => {
  document.getElementById("success-overlay")!.style.display = "none";
});

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

const request = <T>(path: string, init: RequestInit = {}) => portal.request<T>(path, init);
async function init() {
  try {
    if (!await portal.start()) {
      switchView("login");
      document.getElementById("login-error")!.textContent = "Pindai QR Akses dari admin sekolah untuk masuk.";
      document.getElementById("btn-start-login-scan")!.style.display = "block";
      document.getElementById("btn-login-retry")!.style.display = "none";
      return;
    }
    const schoolDisplay = document.getElementById("school-name-display");
    if (schoolDisplay) {
      schoolDisplay.textContent = portal.context!.school_name;
    }
    await loadDashboard();
  } catch (error) {
    switchView("login");
    document.getElementById("login-error")!.textContent = error instanceof Error ? error.message : "Belum dapat terhubung.";
    document.getElementById("btn-login-retry")!.style.display = "block";
    document.getElementById("btn-start-login-scan")!.style.display = "block";
  }
}

// 2. LOGIN (Disabled)
document.getElementById("form-login")!.addEventListener("submit", (e) => {
  e.preventDefault();
  void init();
});

// 3. DASHBOARD
async function loadDashboard() {
  const container = document.getElementById("ekskul-list")!;
  container.innerHTML = "Memuat data...";
  switchView("dashboard");
  try {
    const activities = await request<any[]>("/extracurriculars");
    if (!activities.length) {
      container.innerHTML = "<p>Anda belum ditugaskan ke ekstrakurikuler manapun.</p>";
      return;
    }
    container.replaceChildren();
    for (const item of activities) {
      const article = document.createElement("article");
      const code = document.createElement("small"); code.textContent = item.code;
      const name = document.createElement("h2"); name.textContent = item.name;
      const button = document.createElement("button"); button.textContent = "Pilih Kegiatan";
      button.onclick = () => selectEkskul(item.id, item.name);
      article.append(code, name, button); container.append(article);
    }

    // Auto-select if URL parameter exists, or if there's only 1 activity, or just auto-select the first one to skip dashboard
    const urlParams = new URLSearchParams(window.location.search);
    const ekskulParam = urlParams.get("ekskulId");
    if (ekskulParam) {
      const match = activities.find(a => a.id === ekskulParam);
      if (match) return selectEkskul(match.id, match.name);
    }
    
    // Bypass dashboard: automatically select the first extracurricular if available
    if (activities.length > 0) {
      return selectEkskul(activities[0].id, activities[0].name);
    }
  } catch (err: any) { container.textContent = err.message; throw err; }
}

async function selectEkskul(id: string, name: string) {
  if (selecting || submitting) return;
  selecting = true;
  currentSessionId = "";
  currentEkskulId = id;
  document.getElementById("scan-ekskul-title")!.textContent = name;

  // Set URL and Title for iOS Add to Home Screen
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set("ekskulId", id);
  window.history.replaceState(null, "", newUrl.toString());
  document.title = name;

  // Generate Dynamic Manifest for Android WebAPK
  const dynamicManifest = {
    name: name,
    short_name: name,
    start_url: newUrl.pathname + newUrl.search,
    display: "standalone",
    theme_color: "#07563f",
    background_color: "#eff8f3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };
  const stringManifest = JSON.stringify(dynamicManifest);
  const blob = new Blob([stringManifest], { type: "application/json" });
  const manifestURL = URL.createObjectURL(blob);
  document.querySelector("link[rel=manifest]")?.setAttribute("href", manifestURL);

  // Trigger PWA Installation prompt *after* selection
  offerInstall();

  // Auto-setup today's session
  try {
    const todayStr = new Date().toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById("session-date-label")!.textContent = todayStr;

    // Check if session exists for today
    const sessions = await request<any[]>(`/extracurriculars/${id}/sessions`);
    let todaySession = sessions.find(s => ['OPEN', 'SCHEDULED'].includes(s.status) && new Date(s.starts_at).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) === todayStr);

    if (!todaySession) {
      // Create if it doesn't exist
      todaySession = await request<any>(`/extracurriculars/${id}/sessions`, {
        method: "POST", body: JSON.stringify({
          name: `Sesi ${new Date().toLocaleDateString("id-ID")}`, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 7200000).toISOString()
        })
      });
    }

    currentSessionId = todaySession.id;
    document.getElementById("enrollment-overlay")!.style.display = "none";
    document.getElementById("error-overlay")!.style.display = "none";
    switchView("scan");
    void loadSessionSummary();
  } catch (err: any) {
    alert("Gagal memuat atau membuat sesi: " + err.message);
    switchView("dashboard");
  } finally { selecting = false; }
}

document.querySelectorAll(".back-btn").forEach(btn => btn.addEventListener("click", (e) => {
  const target = (e.currentTarget as HTMLElement).getAttribute("data-target") as keyof typeof views;
  if (target === "dashboard") {
    // Clear URL parameters when going back to dashboard
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete("ekskulId");
    window.history.replaceState(null, "", newUrl.toString());
    document.title = "AKSIS Ekskul";
  }
  switchView(target);
}));

// 5. SCANNER & ENROLLMENT
document.getElementById("form-scan")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("scan-input") as HTMLInputElement;
  const errorEl = document.getElementById("scan-error")!;
  const query = input.value.trim();
  if (!query || submitting || !currentSessionId) return;
  submitting = true;

  errorEl.textContent = "";
  document.getElementById("enrollment-overlay")!.style.display = "none";
  document.getElementById("error-overlay")!.style.display = "none";
  const toast = document.getElementById("processing-toast")!;

  // 1. FAST PATH: Check Local Cache (Optimistic UI)
  const cacheKey = `ekskul_cache_${currentEkskulId}_${query}`;
  const cachedStr = localStorage.getItem(cacheKey);
  if (cachedStr) {
    try {
      const student = JSON.parse(cachedStr);
      pendingStudent = student;
      input.value = "";
      
      // Instantly show success UI
      const avatarEl = document.getElementById("student-avatar");
      if (avatarEl) {
        if (student.photo_url) {
          avatarEl.innerHTML = `<div style="flex: 1; align-self: stretch; width: 100%; height: 100%; background-image: url('${student.photo_url}'); background-size: cover; background-position: center; background-repeat: no-repeat; border-radius: 13px;"></div>`;
        } else {
          avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
        }
      }
      
      document.getElementById("success-student-name")!.textContent = student.full_name;
      document.getElementById("success-time")!.textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
      if (navigator.vibrate) navigator.vibrate(50);
      
      const overlay = document.getElementById("success-overlay")!;
      overlay.style.display = "flex";
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = window.setTimeout(() => overlay.style.display = "none", 5000);
      
      // Fire background request silently
      request(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/attendance`, {
        method: "POST", body: JSON.stringify({ student_id: student.id, status: "PRESENT" })
      }).then(() => {
        void loadSessionSummary();
      }).catch(err => console.error("Background sync failed:", err));
      
      submitting = false;
      return; // DONE! Lightning fast.
    } catch (e) {
      // If JSON parse fails, ignore and fallback to slow path
    }
  }

  // 2. SLOW PATH: Network Request
  toast.style.display = "flex";

  try {
    const students = /^[a-f0-9]{48}$/.test(query)
      ? [await request<{id:string;full_name:string;photo_url?:string}>("/cards/resolve", {method:"POST",body:JSON.stringify({qr_key:query})})]
      : await request<Array<{id:string;full_name:string;photo_url?:string}>>(`/students?search=${encodeURIComponent(query)}`);
    if (students.length !== 1) throw new Error(students.length ? "Masukkan NIS/NISN lengkap agar siswa tidak tertukar." : "Siswa tidak ditemukan.");
    const student = students[0]!;
    pendingStudent = student;
    enrollmentKey = crypto.randomUUID();
    input.value = "";
    errorEl.textContent = "";

    // Record attendance directly
    try {
      await request(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/attendance`, {
        method: "POST", body: JSON.stringify({
          student_id: student.id, status: "PRESENT"
        })
      });
      // Cache for future fast-scans
      try {
        localStorage.setItem(cacheKey, JSON.stringify(student));
      } catch (e) { /* ignore */ }
      
      const avatarEl = document.getElementById("student-avatar");
      if (avatarEl) {
        if (student.photo_url) {
          avatarEl.innerHTML = `<div style="flex: 1; align-self: stretch; width: 100%; height: 100%; background-image: url('${student.photo_url}'); background-size: cover; background-position: center; background-repeat: no-repeat; border-radius: 13px;"></div>`;
        } else {
          avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
        }
      }
      
      document.getElementById("success-student-name")!.textContent = student.full_name;
      document.getElementById("success-time")!.textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
      
      if (navigator.vibrate) navigator.vibrate(50);
      
      const overlay = document.getElementById("success-overlay")!;
      overlay.style.display = "flex";
      toast.style.display = "none";
      void loadSessionSummary();
      
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = window.setTimeout(() => {
        overlay.style.display = "none";
      }, 5000);
      
      
    } catch (err: any) {
      // If error is FK violation or related to membership, trigger Fast Enrollment
      if (err instanceof PortalError && err.code === "EXTRACURRICULAR_MEMBER_REQUIRED") {
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        document.getElementById("unregistered-student-name")!.textContent = student.full_name;
        document.getElementById("enrollment-overlay")!.style.display = "flex";
      } else {
        throw err;
      }
    }
  } catch (err: any) {
    errorEl.textContent = err.message;
    const errorMsgEl = document.getElementById("error-overlay-msg");
    if (errorMsgEl) errorMsgEl.textContent = err.message;
    document.getElementById("error-overlay")!.style.display = "flex";
  } finally { 
    submitting = false; 
    toast.style.display = "none";
  }
});

document.getElementById("btn-cancel-enroll")!.addEventListener("click", () => {
  document.getElementById("enrollment-overlay")!.style.display = "none";
  // document.getElementById("scan-input")?.focus();
});

document.getElementById("btn-confirm-enroll")!.addEventListener("click", async () => {
  if (submitting || !pendingStudent || !enrollmentKey) return;
  submitting = true;
  const errorEl = document.getElementById("scan-error")!;
  try {
    document.getElementById("enrollment-overlay")!.style.display = "none";
    errorEl.textContent = "Mendaftarkan siswa...";
    const toast = document.getElementById("processing-toast")!;
    toast.style.display = "flex";

    // Fast Enroll
    await request(`/extracurriculars/${currentEkskulId}/members/fast-enroll`, {
      method: "POST", body: JSON.stringify({
        student_id: pendingStudent.id, idempotency_key: enrollmentKey, confirmed: true
      })
    });

    // Then Attendance
    errorEl.textContent = "Mencatat presensi...";
    await request(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/attendance`, {
      method: "POST", body: JSON.stringify({
        student_id: pendingStudent.id, status: "PRESENT"
      })
    });

    errorEl.textContent = "";
    
    const avatarEl = document.getElementById("student-avatar");
    if (avatarEl) {
      if (pendingStudent.photo_url) {
        avatarEl.innerHTML = `<div style="flex: 1; align-self: stretch; width: 100%; height: 100%; background-image: url('${pendingStudent.photo_url}'); background-size: cover; background-position: center; background-repeat: no-repeat; border-radius: 13px;"></div>`;
      } else {
        avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
      }
    }
    
    document.getElementById("success-student-name")!.textContent = pendingStudent.full_name;
    document.getElementById("success-time")!.textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    
    
    const overlay = document.getElementById("success-overlay")!;
    overlay.style.display = "flex";
    toast.style.display = "none";
    void loadSessionSummary();

    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = window.setTimeout(() => {
      overlay.style.display = "none";
    }, 5000);

  } catch (err: any) {
    errorEl.textContent = "Gagal: " + err.message;
    document.getElementById("enrollment-overlay")!.style.display = "flex";
    document.getElementById("processing-toast")!.style.display = "none";
  } finally { submitting = false; }
});

async function loadAttendanceList() {
  if (!currentEkskulId || !currentSessionId) return;
  const container = document.getElementById("attendance-list-container")!;
  container.innerHTML = `<p style="color:#66877a; font-size:0.85rem; text-align:center; padding: 20px 0;">Memuat data kehadiran...</p>`;
  try {
    const list = await request<Array<{
      id: string; student_id: string; status: string; notes?: string; recorded_at: string;
      extracurricular_members: { students: { full_name: string; student_number: string } }
    }>>(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/attendance`);
    
    if (list.length === 0) {
      container.innerHTML = `<p style="color:#66877a; font-size:0.85rem; text-align:center; padding: 20px 0;">Belum ada siswa yang hadir atau izin.</p>`;
      return;
    }

    container.innerHTML = list.map(item => {
      const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.recorded_at));
      const isHadir = item.status === "PRESENT";
      const icon = isHadir 
        ? `<div style="background:#e7f7ed; color:#27a36c; width:32px; height:32px; border-radius:50%; display:grid; place-items:center; flex:none;"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></div>`
        : `<div style="background:#fff4e5; color:#e0840b; width:32px; height:32px; border-radius:50%; display:grid; place-items:center; flex:none;"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg></div>`;
      
      const statusText = isHadir ? "Hadir" : `Izin${item.notes ? ` (${item.notes})` : ""}`;
      
      return `
        <div class="attendance-item">
          <div style="display:flex; align-items:center; gap:10px;">
            ${icon}
            <div>
              <div style="font-size:0.9rem; font-weight:600; color:#0e402a;">${item.extracurricular_members?.students?.full_name ?? "-"}</div>
              <div style="font-size:0.75rem; color:#66877a;">${item.extracurricular_members?.students?.student_number || "-"} • ${statusText}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:#66877a; font-weight:500;">${time}</div>
        </div>
      `;
    }).join("");
  } catch (err: any) {
    container.innerHTML = `<p style="color:#d32f2f; font-size:0.85rem; text-align:center; padding: 20px 0;">Gagal memuat data: ${err.message}</p>`;
  }
}

document.getElementById("btn-lihat-kehadiran")?.addEventListener("click", () => {
  document.getElementById("attendance-ekskul-title")!.textContent = document.getElementById("scan-ekskul-title")!.textContent;
  document.getElementById("attendance-session-date")!.textContent = new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date());
  switchView("attendance");
  document.getElementById("izin-prompt")!.style.display = "none";
  void loadAttendanceList();
});

document.getElementById("btn-input-izin")?.addEventListener("click", () => {
  document.getElementById("izin-prompt")!.style.display = "block";
  document.getElementById("izin-error")!.textContent = "";
  (document.getElementById("input-izin-nisn") as HTMLInputElement).focus();
});

document.getElementById("btn-cancel-izin")?.addEventListener("click", () => {
  document.getElementById("izin-prompt")!.style.display = "none";
});

document.getElementById("form-izin")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitting) return;
  const nisnInput = document.getElementById("input-izin-nisn") as HTMLInputElement;
  const notesInput = document.getElementById("input-izin-keterangan") as HTMLInputElement;
  const errorEl = document.getElementById("izin-error")!;
  const query = nisnInput.value.trim();
  const notes = notesInput.value.trim();
  
  if (!query || !notes) return;
  submitting = true;
  errorEl.textContent = "Menyimpan data...";
  
  try {
    const students = await request<Array<{id:string;full_name:string}>>(`/students?search=${encodeURIComponent(query)}`);
    if (students.length !== 1) throw new Error(students.length ? "Masukkan NIS/NISN lengkap agar siswa tidak tertukar." : "Siswa tidak ditemukan.");
    const student = students[0]!;
    
    // First fast-enroll the student to ensure they can be marked absent/excused
    try {
      await request(`/extracurriculars/${currentEkskulId}/members/fast-enroll`, {
        method: "POST", body: JSON.stringify({
          student_id: student.id, idempotency_key: crypto.randomUUID(), confirmed: true
        })
      });
    } catch {
      // Ignore if already active member
    }
    
    // Record attendance as EXCUSED
    await request(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/attendance`, {
      method: "POST", body: JSON.stringify({
        student_id: student.id, status: "EXCUSED", notes
      })
    });
    
    // Reset and reload
    nisnInput.value = "";
    notesInput.value = "";
    errorEl.textContent = "";
    document.getElementById("izin-prompt")!.style.display = "none";
    
    void loadSessionSummary();
    void loadAttendanceList();
  } catch (err: any) {
    errorEl.textContent = err.message;
  } finally { submitting = false; }
});

void init();

