import { DurableQueue } from "../../shared/durable-queue";
import { StudentCache, startRosterRefresh } from "../../shared/offline-store";
import { QRCamera, bindLoginCamera } from "../../shared/qr-camera";
import { renderPortrait } from "../../shared/portrait";
import { gateIntro, gateHelp, schoolLabel } from "../../shared/portal-ui";
import { NaturalVoice } from "../../shared/natural-voice";

import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall, promptOrOfferInstall, isInstalled } from "../../shared/install-prompt";
import "./style.css";
import "../../shared/scanner.css";

const portal = new PortalSession("TEACHER", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Ekstrakurikuler", import.meta.env.BASE_URL, import.meta.env.PROD);

export type EkskulAttendanceRecord = {
  event_id: string;
  ekskul_id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  status: string;
  photo_url?: string | null;
  occurred_at: string;
};

const studentCache = new StudentCache(() => "ekskul:" + (portal.context?.school_id ?? "none") + ":" + (portal.context?.id ?? "none"));
const attendanceQueue = new DurableQueue<EkskulAttendanceRecord>(() => "ekskul_attendance:" + (portal.context?.school_id ?? "none") + ":" + (portal.context?.id ?? "none"));

const speaker = new NaturalVoice("ekskul", ({ enabled, text, hasVoice }) => {
  const toggle = document.getElementById("voice-toggle") as HTMLButtonElement | null;
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.textContent = enabled ? "🔊 Suara aktif" : "🔇 Nonaktif";
  }
  const testBtn = document.getElementById("voice-test") as HTMLButtonElement | null;
  if (testBtn) testBtn.disabled = !enabled;
  const statusEl = document.getElementById("voice-status");
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.cursor = hasVoice ? "default" : "pointer";
    statusEl.title = hasVoice ? "" : "Ketuk untuk melihat panduan pemasangan suara Bahasa Indonesia";
  }
  const guideBtn = document.getElementById("voice-guide-btn") as HTMLButtonElement | null;
  if (guideBtn) {
    guideBtn.style.display = (!hasVoice && enabled) ? "inline-flex" : "none";
  }
});
document.getElementById("voice-toggle")?.addEventListener("click", () => {
  speaker.setEnabled(!speaker.enabled);
});
document.getElementById("voice-test")?.addEventListener("click", () => {
  speaker.unlock();
  if (!speaker.hasIndonesianVoice) {
    speaker.openGuide();
  } else {
    speaker.speak("Suara siap digunakan");
  }
});
document.getElementById("voice-guide-btn")?.addEventListener("click", () => speaker.openGuide());
document.getElementById("voice-status")?.addEventListener("click", () => {
  if (!speaker.hasIndonesianVoice) speaker.openGuide();
});
try { for (const key of Object.keys(localStorage)) if (key.startsWith("ekskul_cache_")) localStorage.removeItem(key); } catch { /* Historical profile cache is no longer used. */ }

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

let summaryVersion=0;
async function loadSessionSummary() {
  if (!currentEkskulId || !currentSessionId) return;
  const revision=++summaryVersion,activity=currentEkskulId,session=currentSessionId;
  const cacheKey = `aksis_ekskul_summary_${activity}_${session}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    if (cached && typeof cached.present === "number") {
      document.getElementById("session-present")!.textContent = String(cached.present);
      document.getElementById("session-excused")!.textContent = String(cached.excused);
      document.getElementById("session-total")!.textContent = String(cached.total);
    }
  } catch {}

  try {
    const summary = await request<SessionSummary>(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/summary`);
    if(revision!==summaryVersion||activity!==currentEkskulId||session!==currentSessionId)return;
    document.getElementById("session-present")!.textContent = String(summary.present);
    document.getElementById("session-excused")!.textContent = String(summary.excused);
    document.getElementById("session-total")!.textContent = String(summary.total);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(summary));
    } catch {}
  } catch {
    if(revision!==summaryVersion||activity!==currentEkskulId||session!==currentSessionId)return;
    const currentPresent = document.getElementById("session-present")!.textContent;
    if (!currentPresent || currentPresent === "" || currentPresent === "—") {
      document.getElementById("session-present")!.textContent = "—";
      document.getElementById("session-excused")!.textContent = "—";
      document.getElementById("session-total")!.textContent = "—";
    }
  }
}

bindLoginCamera(import.meta.env.BASE_URL);

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

const camera = new QRCamera({
  readerId: "qr-reader",
  toggleId: "btn-toggle-camera",
  stageId: "scanner-stage",
  placeholderId: "scanner-placeholder",
  statusId: "scan-status",
  errorId: "scan-error",
  zoomId: "zoom-controls",
  once: true,
  canRead: () =>
    !submitting &&
    Boolean(currentSessionId) &&
    document.getElementById("success-overlay")!.style.display !== "flex" &&
    document.getElementById("enrollment-overlay")!.style.display !== "flex",
  onState: (phase) => {
    isScanning = phase === "active";
  },
  onDecode: async (value) => {
    triggerHapticFeedback();
    const input = document.getElementById("scan-input") as HTMLInputElement;
    input.value = value;
    document.getElementById("form-scan")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  },
});
async function stopCameraScanner(){await camera.stop();currentZoom=1;}
async function startCameraScanner(){await camera.start();}
document.getElementById("btn-switch-camera")!.addEventListener("click",()=>{void camera.flip();});
document.addEventListener("visibilitychange",()=>{if(document.hidden)void stopCameraScanner();});
window.addEventListener("pagehide",()=>{void stopCameraScanner();});

document.getElementById("btn-toggle-camera")?.addEventListener("click", () => {
  if (isScanning) stopCameraScanner();
  else startCameraScanner();
});

function switchView(viewName: keyof typeof views) {
  hideInitialLoader();
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
const activityScopeKey = () => `aksis.ekskul.session.${portal.context?.school_id ?? "none"}:${portal.context?.id ?? "none"}`;
const schoolDay = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Makassar",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

function showSyncBar(active: boolean) {
  const bar = document.getElementById("sync-bar");
  if (bar) {
    if (active) bar.classList.add("active");
    else bar.classList.remove("active");
  }
}

function hideInitialLoader() {
  const loader = document.getElementById("initial-loader");
  if (loader) loader.style.display = "none";
}

function updateOfflineStatus() {
  const badge = document.getElementById("offline-badge");
  if (badge) {
    badge.style.display = navigator.onLine ? "none" : "flex";
  }
}

function restoreOfflineSession(): boolean {
  try {
    const cached=JSON.parse(localStorage.getItem(activityScopeKey()) ?? "null") as {day:string;activityId:string;activityName:string;sessionId:string}|null;
    if(!cached || cached.day!==schoolDay() || !cached.activityId || !cached.sessionId)return false;
    currentEkskulId=cached.activityId;currentSessionId=cached.sessionId;
    const schoolDisplay = document.getElementById("school-name-display");
    if (schoolDisplay) schoolDisplay.textContent=portal.context?.school_name ?? "";
    document.getElementById("scan-ekskul-title")!.textContent=cached.activityName;
    document.getElementById("session-date-label")!.textContent=new Date().toLocaleDateString("id-ID",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    switchView("scan");
    document.getElementById("scan-status")!.textContent="Offline · presensi tersimpan di HP dan menunggu sinkronisasi";
    void loadSessionSummary();
    return true;
  } catch {return false;}
}

function showLoadingOverlay(show: boolean, text = "Memproses...") {
  showSyncBar(show);
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    if (show) {
      const textEl = overlay.querySelector("span");
      if (textEl && text) textEl.textContent = text;
      overlay.style.display = "flex";
    } else {
      overlay.style.display = "none";
    }
  }
  const toast = document.getElementById("processing-toast");
  if (toast) toast.style.display = "none";
}

async function init() {
  updateOfflineStatus();
  // Tahap 3: Popup Install Aplikasi langsung tampil bersamaan saat PWA muncul di browser
  // agar user bisa langsung mengambil tindakan tanpa menunggu proses penarikan data selesai
  if (!isInstalled()) {
    void promptOrOfferInstall();
  }

  try {
    const isLoginFlow = new URL(window.location.href).searchParams.has("token") || new URL(window.location.href).hash.includes("token");

    if (portal.connected && !isLoginFlow) {
      const schoolDisplay = document.getElementById("school-name-display");
      if (schoolDisplay && portal.context) {
        schoolDisplay.textContent = portal.context.school_name;
      }

      if (!navigator.onLine && restoreOfflineSession()) {
        hideInitialLoader();
        return;
      }
      
      await Promise.allSettled([
        portal.start(),
        loadDashboard()
      ]);
      
      hideInitialLoader();
      if (schoolDisplay && portal.context) {
        schoolDisplay.textContent = portal.context.school_name;
      }
      return;
    }

    if (!await portal.start()) {
      hideInitialLoader();
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
    hideInitialLoader();
  } catch (error) {
    hideInitialLoader();
    if (portal.connected && restoreOfflineSession()) {
      return;
    }
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
  
  const urlParams = new URLSearchParams(window.location.search);
  const ekskulParam = urlParams.get("ekskulId");
  let remembered: {activityId?:string;activityName?:string}|null=null;
  try { remembered=JSON.parse(localStorage.getItem(activityScopeKey()) ?? "null"); } catch { /* no remembered activity */ }
  const lastEkskulId = remembered?.activityId;
  const lastEkskulName = remembered?.activityName;
  
  // Optimistically switch to scan view if we know we are auto-selecting
  const willAutoSelect = Boolean(ekskulParam || (lastEkskulId && lastEkskulName));
  
  if (willAutoSelect) {
    const targetName = ekskulParam ? "Memuat kegiatan..." : lastEkskulName!;
    document.getElementById("scan-ekskul-title")!.textContent = targetName;
    document.getElementById("scan-status")!.textContent = "Menyiapkan sesi presensi...";
    switchView("scan");
  } else {
    switchView("dashboard");
    container.innerHTML = "Memuat data...";
  }

  const listCacheKey = `aksis.ekskul.list.${portal.context?.school_id ?? "none"}`;
  let cachedActivities: any[] | null = null;
  try {
    cachedActivities = JSON.parse(localStorage.getItem(listCacheKey) ?? "null");
  } catch {}

  const renderActivities = (activities: any[]) => {
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
      button.onclick = () => { triggerHapticFeedback(); selectEkskul(item.id, item.name); };
      article.append(code, name, button); container.append(article);
    }
  };

  // Render from cache if available and not auto-selecting
  if (cachedActivities && !willAutoSelect) {
    renderActivities(cachedActivities);
  }

  showSyncBar(true);
  try {
    const activities = await request<any[]>("/extracurriculars");
    try {
      localStorage.setItem(listCacheKey, JSON.stringify(activities));
    } catch {}
    
    // Auto-select if URL parameter exists
    if (ekskulParam) {
      const match = activities.find(a => a.id === ekskulParam);
      if (match) return selectEkskul(match.id, match.name, true);
    }
    
    // Auto-select if previously remembered in localStorage
    if (lastEkskulId) {
      const match = activities.find(a => a.id === lastEkskulId);
      if (match) return selectEkskul(match.id, match.name, true);
    }
    
    // Bypass dashboard: automatically select if there's exactly 1 activity
    if (activities.length === 1) {
      return selectEkskul(activities[0].id, activities[0].name, willAutoSelect);
    }

    // If we get here, auto-selection failed or wasn't applicable. Make sure dashboard is shown.
    if (willAutoSelect) {
      switchView("dashboard");
    }

    renderActivities(activities);
  } catch (err: any) { 
    if (cachedActivities && cachedActivities.length > 0) {
      if (willAutoSelect) {
        if (lastEkskulId) {
          const match = cachedActivities.find(a => a.id === lastEkskulId);
          if (match) return selectEkskul(match.id, match.name, true);
        }
        switchView("dashboard");
      }
      renderActivities(cachedActivities);
      return;
    }
    if (willAutoSelect) switchView("dashboard");
    container.textContent = err.message; 
    throw err; 
  } finally {
    showSyncBar(false);
  }
}

async function selectEkskul(id: string, name: string, isSilent = false) {
  if (selecting || submitting) return;
  selecting = true;
  showSyncBar(true);
  currentSessionId = "";
  currentEkskulId = id;
  document.getElementById("scan-ekskul-title")!.textContent = name;
  document.getElementById("scan-status")!.textContent = "Menyiapkan sesi presensi...";
  switchView("scan");

  // Set URL for iOS Add to Home Screen/bookmarking
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set("ekskulId", id);
  window.history.replaceState(null, "", newUrl.toString());

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
    try {localStorage.setItem(activityScopeKey(),JSON.stringify({day:schoolDay(),activityId:id,activityName:name,sessionId:todaySession.id}));} catch { /* online scanning remains available */ }
    document.getElementById("enrollment-overlay")!.style.display = "none";
    document.getElementById("error-overlay")!.style.display = "none";
    document.getElementById("scan-status")!.textContent = "Aktifkan kamera atau masukkan nomor siswa";
    void loadSessionSummary();
  } catch (err: any) {
    try {
      const cached = JSON.parse(localStorage.getItem(activityScopeKey()) ?? "null");
      if (cached && cached.activityId === id && cached.sessionId) {
        currentSessionId = cached.sessionId;
        document.getElementById("scan-status")!.textContent = "Offline · presensi tersimpan di HP";
        void loadSessionSummary();
        return;
      }
    } catch {}
    alert("Gagal memuat atau membuat sesi: " + err.message);
    switchView("dashboard");
  } finally { 
    selecting = false; 
    showSyncBar(false);
  }
}

document.querySelectorAll(".back-btn").forEach(btn => btn.addEventListener("click", (e) => {
  const target = (e.currentTarget as HTMLElement).getAttribute("data-target") as keyof typeof views;
  if (target === "dashboard") {
    // Clear URL parameters when going back to dashboard
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete("ekskulId");
    window.history.replaceState(null, "", newUrl.toString());
    document.title = "AKSIS Ekskul";
    // Clear remembered activity
    localStorage.removeItem(activityScopeKey());
  }
  switchView(target);
}));

// 5. SCANNER & ENROLLMENT
let syncingAttendance = false;
async function syncAttendanceQueue() {
  if (syncingAttendance || !navigator.onLine) return;
  syncingAttendance = true;
  showSyncBar(true);
  const scope = attendanceQueue.currentScope;
  try {
    const pending = await attendanceQueue.getPending(scope);
    if (!pending.length) return;
    for (const item of pending) {
      if (scope !== attendanceQueue.currentScope) break;
      try {
        await request(`/extracurriculars/${item.payload.ekskul_id}/sessions/${item.payload.session_id}/attendance`, {
          method: "POST",
          body: JSON.stringify({
            student_id: item.payload.student_id,
            status: item.payload.status,
          }),
        });
        await attendanceQueue.markSynced(item.event_id, scope);
      } catch (err: any) {
        await attendanceQueue.markFailed(item.event_id, err instanceof Error ? err.message : "Sinkronisasi gagal", scope);
        if (err instanceof PortalError && err.status >= 400 && err.status < 500 && err.status !== 429) { document.getElementById("scan-error")!.textContent = "Ada presensi tertunda yang perlu diperiksa: " + err.message; continue; }
        break;
      }
    }
    void loadSessionSummary();
  } catch { /* Storage or network unavailable: keep events for retry. */
  } finally {
    syncingAttendance = false;
    showSyncBar(false);
  }
}

document.getElementById("form-scan")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("scan-input") as HTMLInputElement;
  const errorEl = document.getElementById("scan-error")!;
  const query = input.value.trim();
  if (!query || submitting || !currentSessionId) return;

  errorEl.textContent = "";
  document.getElementById("enrollment-overlay")!.style.display = "none";
  document.getElementById("error-overlay")!.style.display = "none";

  // 1. FAST PATH (Instant local resolution & queue)
  const cached = studentCache.resolve(query);
  if (cached) {
    submitting = true;
    try {
      await attendanceQueue.enqueue({
        event_id: crypto.randomUUID(), ekskul_id: currentEkskulId,
        session_id: currentSessionId, student_id: cached.id,
        student_name: cached.full_name, status: "PRESENT", photo_url: cached.photo_url,
        occurred_at: new Date().toISOString(),
      });
    } catch {
      errorEl.textContent = "Gagal menyimpan di perangkat. Periksa ruang penyimpanan dan coba lagi.";
      return;
    } finally { submitting = false; }
    input.value = "";
    errorEl.textContent = `${cached.full_name}: tersimpan di HP, menunggu verifikasi.`;
    if (navigator.vibrate) navigator.vibrate(50);
    speaker.speak(`${cached.full_name}, hadir`);
    void syncAttendanceQueue();
    return;
  }

  // 2. FALLBACK PATH (If student not in local cache yet)
  submitting = true;
  const button = document.querySelector<HTMLButtonElement>('#form-scan button[type="submit"]')!;
  button.disabled = true;
  const toast = document.getElementById("processing-toast")!;
  toast.style.display = "flex";
  try {
    const result = await request<{student:{id:string;full_name:string;photo_url?:string},needs_enrollment:boolean}>(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/scan`, {method:"POST",body:JSON.stringify({identity:query})});
    const student = result.student;
    studentCache.put({
      id: student.id,
      full_name: student.full_name,
      photo_url: student.photo_url,
      cards: [{ card_uid: query, qr_key: query }],
    });

    pendingStudent = student; enrollmentKey = crypto.randomUUID(); input.value = "";
    if (result.needs_enrollment) {
      document.getElementById("unregistered-student-name")!.textContent = student.full_name;
      document.getElementById("enrollment-overlay")!.style.display = "flex";
      return;
    }
    const avatar = document.getElementById("student-avatar")!;
    renderPortrait(avatar,student.photo_url);
    document.getElementById("success-student-name")!.textContent = student.full_name;
    document.getElementById("success-time")!.textContent = new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit"}).format(new Date());
    if (navigator.vibrate) navigator.vibrate(50);
    speaker.speak(`${student.full_name}, hadir`);
    errorEl.textContent = `${student.full_name}: kehadiran tercatat.`;
    void loadSessionSummary();
  } catch(error) {
    const text = error instanceof Error ? error.message : "Presensi belum dapat disimpan. Coba kembali.";
    errorEl.textContent = text;
    document.getElementById("error-overlay-msg")!.textContent = text;
    document.getElementById("error-overlay")!.style.display = "flex";
  } finally {submitting=false;button.disabled=false;toast.style.display="none";}
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
        renderPortrait(avatarEl,pendingStudent.photo_url);
      } else {
        avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
      }
    }
    
    document.getElementById("success-student-name")!.textContent = pendingStudent.full_name;
    document.getElementById("success-time")!.textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    
    
    speaker.speak(`${pendingStudent.full_name}, terdaftar dan hadir`);
    const overlay = document.getElementById("success-overlay")!;
    overlay.style.display = "flex";
    toast.style.display = "none";
    void loadSessionSummary();

    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = window.setTimeout(() => {
      overlay.style.display = "none";
    }, 1800);

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

// Background sync loop: sync attendance quietly every 8.5 seconds
const SYNC_INTERVAL_MS = 8500;
window.setInterval(() => {
  void syncAttendanceQueue();
}, SYNC_INTERVAL_MS);

window.addEventListener("online", () => {
  updateOfflineStatus();
  void syncAttendanceQueue();
  void loadSessionSummary();
});

window.addEventListener("offline", () => {
  updateOfflineStatus();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void syncAttendanceQueue();
});


startRosterRefresh(portal, studentCache);
