import { DurableQueue } from "../../shared/durable-queue";
import { StudentCache, startRosterRefresh, syncPortalRoster } from "../../shared/offline-store";
import { QRCamera, bindLoginCamera } from "../../shared/qr-camera";
import { gateIntro, gateHelp, escapePortal as esc } from "../../shared/portal-ui";
import { NaturalVoice } from "../../shared/natural-voice";
import "./style.css";
import "../../shared/scanner.css";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall, promptOrOfferInstall, isInstalled } from "../../shared/install-prompt";
import { calculateWasteMeasurement, type WasteType, type WasteUnit } from "./waste-calculation.js";

const portal = new PortalSession("WASTE_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Piket Bank Sampah", import.meta.env.BASE_URL, import.meta.env.PROD);

export type WasteQueueItem = {
  event_id: string;
  class_id: string;
  student_id: string;
  student_name: string;
  organic_kg: number;
  inorganic_kg: number;
  source: string;
  total_kg: number;
  occurred_at: string;
};

const studentCache = new StudentCache(() => "waste:" + (portal.context?.school_id ?? "none") + ":" + (portal.context?.id ?? "none"));
const wasteQueue = new DurableQueue<WasteQueueItem>(() => "waste_deposits:" + (portal.context?.school_id ?? "none") + ":" + (portal.context?.id ?? "none"));

const speaker = new NaturalVoice("waste", ({ enabled, text, hasVoice }) => {
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
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = <T extends HTMLInputElement | HTMLSelectElement = HTMLInputElement>(id: string) => el<T>(id);
const number = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
const message = (error: unknown) => error instanceof Error ? error.message : "Layanan belum dapat dihubungi. Coba kembali.";
const login = el("view-login");
const loginForm = el<HTMLFormElement>("form-login");
login.classList.add("portal-gate");
login.innerHTML = gateIntro("Piket Bank Sampah", "Catat setoran dan lihat kontribusi sekolah melalui akses resmi dari admin.");
login.append(loginForm); login.insertAdjacentHTML("beforeend", gateHelp);

bindLoginCamera(import.meta.env.BASE_URL);

type View = "login" | "scan" | "input" | "success" | "ranking";
type Student = { id: string; full_name: string; nisn?: string | null; student_number: string; photo_url?: string | null };
type RankedStudent = { student_id: string; full_name: string; class_name: string; total_kg: number };
type Dashboard = {
  school_id: string;
  period: string; timezone: string; as_of: string; rates: { organic: number | null; inorganic: number | null };
  today: { students: number; total_kg: number; points: number; transactions: number; unscored: number };
  classes: { class_id: string; class_name: string; total_kg: number; student_count: number }[];
  top_students: RankedStudent[]; bottom_students: RankedStudent[];
};
let view: View = "login", classId = "", className = "", student: Student | null = null;
let dashboard: Dashboard | null = null, dashboardRequest = 0;
let activePortalId = "";
let scanning = false, cameraBusy = false, facing: "environment" | "user" = "environment";
let resolving = false, saving = false, resumeCameraAfterDeposit = false;
type PendingDeposit = { event_id: string; class_id: string; student_id: string; organic_kg: number; inorganic_kg: number; source: string };
let pending: PendingDeposit | null = null;
const pendingKey = () => `aksis.waste.pending.${portal.context?.id ?? ""}`;
const activeSessionKey = () => `aksis.waste.active_session.${portal.context?.id ?? ""}`;
function rememberPending() {
  try {
    if (pending && student) sessionStorage.setItem(pendingKey(), JSON.stringify({ pending, student }));
    else sessionStorage.removeItem(pendingKey());
  } catch { /* In-memory retry still protects this session when storage is disabled. */ }
}
function rememberActiveSession() {
  try {
    if (student && (view === "input" || view === "login")) {
      sessionStorage.setItem(activeSessionKey(), JSON.stringify({ student, view: "input" }));
    } else if (view === "scan" || view === "success") {
      sessionStorage.removeItem(activeSessionKey());
    }
  } catch { /* Storage fallback */ }
}
function showStudent(selected: Student) {
  student = selected;
  el("input-student-name").textContent = student.full_name;
  const avatarEl = el("student-avatar");
  if (student.photo_url) {
    avatarEl.innerHTML = `<img src="${esc(student.photo_url)}" alt="${esc(student.full_name)}" class="student-photo-img" />`;
  } else {
    avatarEl.innerHTML = `<div class="avatar-fallback" title="${esc(student.full_name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
  }
  rememberActiveSession();
}

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
    } catch { /* Ignore vibration block */ }
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
  } catch { /* Audio fallback */ }
}

function triggerCameraFlash() {
  triggerHapticFeedback();
  const flashEl = el("camera-shutter-flash");
  if (flashEl) {
    flashEl.classList.remove("flash-active");
    void flashEl.offsetWidth; // force reflow
    flashEl.classList.add("flash-active");
    setTimeout(() => {
      flashEl.classList.remove("flash-active");
    }, 450);
  }
}

let currentZoom = 1;
let initialTouchDistance = 0;
let initialZoomOnTouch = 1;

async function setCameraZoom(value:number) {currentZoom=value;await camera.setZoom(value);}

function setupScannerPinchZoom() {
  const stage = document.querySelector<HTMLElement>(".scanner-viewport");
  if (!stage) return;

  const handleTouchStart = (e: TouchEvent) => {
    const target = e.target as HTMLElement | null;
    const isInside = target && (stage.contains(target) || !!target.closest("#scanner-stage, #qr-reader"));
    if (isInside && e.touches.length === 2 && scanning) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      initialTouchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      initialZoomOnTouch = currentZoom;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    const target = e.target as HTMLElement | null;
    const isInside = target && (stage.contains(target) || !!target.closest("#scanner-stage, #qr-reader"));
    if (isInside && e.touches.length === 2 && scanning) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (initialTouchDistance === 0) {
        initialTouchDistance = currentDist;
        initialZoomOnTouch = currentZoom;
      } else {
        const factor = currentDist / initialTouchDistance;
        const targetZoom = Math.max(1, Math.min(5, initialZoomOnTouch * factor));
        void setCameraZoom(targetZoom);
      }
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      initialTouchDistance = 0;
    }
  };

  stage.addEventListener("touchstart", handleTouchStart, { passive: false });
  stage.addEventListener("touchmove", handleTouchMove, { passive: false });
  stage.addEventListener("touchend", handleTouchEnd, { passive: true });
  stage.addEventListener("touchcancel", handleTouchEnd, { passive: true });
}

function hideNotFoundModal() {
  const modal = el("modal-not-found");
  if (modal) modal.style.display = "none";
}

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

function showLoadingOverlay(show: boolean, text = "Memproses...") {
  showSyncBar(show);
  const overlay = el("loading-overlay");
  if (!overlay) return;
  if (show) {
    const textEl = overlay.querySelector("span");
    if (textEl && text) textEl.textContent = text;
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }
}

const camera = new QRCamera({readerId:"qr-reader",toggleId:"btn-toggle-camera",stageId:"scanner-stage",placeholderId:"scanner-placeholder",statusId:"scan-status",errorId:"scan-error",zoomId:"zoom-controls",once:true,canRead:()=>view==="scan"&&!resolving&&!pending,onState:phase=>{scanning=phase==="active";},onDecode:async value=>{triggerCameraFlash();await resolveStudent(value);}});
async function stopCamera(){await camera.stop();currentZoom=1;}
async function startCamera(){if(cameraBusy||scanning)return;cameraBusy=true;try{await camera.start(facing);}finally{cameraBusy=false;}}
document.addEventListener("visibilitychange",()=>{if(document.hidden)void stopCamera();});
window.addEventListener("pagehide",()=>{void stopCamera();});

function switchView(next: View) {
  view = next;
  hideInitialLoader();
  hideNotFoundModal();
  showLoadingOverlay(false);
  if (next !== "scan") void stopCamera();
  for (const name of ["login", "scan", "input", "success", "ranking"] as View[]) {
    const section = el(`view-${name}`);
    if (name === next) {
      section.style.display = name === "input" ? "flex" : "block";
    } else {
      section.style.display = "none";
    }
  }
  el("workspace-nav").hidden = next === "login";
  el("today-panel").hidden = next !== "ranking";
  el("form-scan").hidden = false;
  el("btn-toggle-camera").hidden = true;
  el("btn-switch-camera").hidden = false;
  el("scanner-hint").textContent = "Ketuk area ini untuk memindai";
  el("scan-status").textContent = next === "input" ? "✓ Siswa terdeteksi · siap mencatat setoran" : "Kamera nonaktif · ketuk area scan untuk memindai";
  document.body.classList.toggle("show-ranking", next === "ranking");
  const subEl = document.getElementById("header-subtitle");
  if (subEl) subEl.textContent = "Piket Sampah";
  if (next === "ranking") window.scrollTo({ top: 0, behavior: "instant" });
  for (const [id, active] of [["btn-ranking", next === "ranking"], ["btn-deposit", next !== "ranking"]] as const) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.toggle("active", active);
      if (active) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    }
  }
  rememberActiveSession();
}
function updateMeasurement() {
  const type = document.querySelector<HTMLInputElement>('input[name="waste_type"]:checked')!.value as WasteType;
  const result = calculateWasteMeasurement(Number(input("weight-input").value), input<HTMLSelectElement>("unit-select").value as WasteUnit, type);
  el<HTMLOutputElement>("total").value = `${number(result.total_kg)} kg`;
  const rate = type === "ORGANIC" ? dashboard?.rates.organic : dashboard?.rates.inorganic;
  el("points-preview").textContent = rate == null ? "—" : `${number(Math.round(result.total_kg * rate * 100) / 100)} poin`;
  el("points-hint").textContent = rate == null ? (dashboard ? "Tarif poin belum diatur sekolah" : "Tarif poin belum tersedia") : `${number(rate)} poin / kg`;
  return result;
}
function clearDailySummary() {
  for (const id of ["today-students", "today-weight", "today-points"]) el(id).textContent = "—";
  el("today-date").textContent = "";
  el("today-points-label").textContent = "Total poin tercatat";
}
function renderDashboard(data: Dashboard) {
  el("today-date").textContent = new Intl.DateTimeFormat("id-ID", { timeZone: data.timezone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(data.as_of));
  el("today-students").textContent = `${number(data.today.students)} siswa`;
  el("today-weight").textContent = `${number(data.today.total_kg)} kg`;
  const noRecordedPoints = data.today.transactions > 0 && data.today.unscored === data.today.transactions;
  el("today-points").textContent = noRecordedPoints || (data.rates.organic == null && data.rates.inorganic == null && data.today.points === 0) ? "—" : `${number(data.today.points)} poin`;
  el("today-points-label").textContent = data.today.unscored ? `${data.today.unscored} setoran belum memiliki poin` : "Total poin tercatat";
  el("today-date").title = `Tanggal sekolah · ${data.timezone}`;
  const colors = ["#087f52", "#54b980", "#91ce6d", "#d5ae42", "#70aeb0"];
  const total = data.classes.reduce((sum, c) => sum + c.total_kg, 0);
  const contributors = data.classes.filter(c => c.total_kg > 0).length;
  const periodLabel = { today: "Hari ini", month: "Bulan ini", all: "Semua waktu" }[data.period] ?? "Periode terpilih";
  el("period-weight").textContent = `${number(total)} kg`;
  el("period-caption").textContent = periodLabel;
  el("participating-classes").textContent = `${number(contributors)} / ${number(data.classes.length)} kelas`;
  el("participation-caption").textContent = contributors ? "Sudah menyetor pada periode ini" : "Yuk, mulai setoran pertama!";
  const leader = data.classes[0];
  el("leading-class").textContent = total > 0 && leader ? `${leader.class_name} menyumbang ${number(Math.round(leader.total_kg / total * 1000) / 10)}% dari total kelas aktif` : "Belum ada setoran pada periode ini.";
  let offset = 0;
  const segments = data.classes.filter(c => c.total_kg > 0).map(c => {
    const start = offset; offset += c.total_kg / total * 100;
    return `${colors[data.classes.indexOf(c) % colors.length]} ${start}% ${offset}%`;
  });
  el("contribution-donut").style.background = segments.length ? `conic-gradient(${segments.join(",")})` : "#e2ece6";
  el("contribution-donut").setAttribute("aria-label", total > 0 ? `Kontribusi kelas: ${data.classes.filter(c => c.total_kg > 0).map(c => `${c.class_name} ${number(c.total_kg)} kg`).join(", ")}` : "Belum ada setoran kelas pada periode ini");
  const max = Math.max(1, ...data.classes.map(c => c.total_kg));
  el("class-ranking").innerHTML = data.classes.length ? data.classes.slice(0, 3).map((c, i) => `<li style="--bar-height:${Math.max(0, Math.min(100, c.total_kg / max * 100))}%"><span class="rank-number">${i + 1}</span><div class="rank-person"><strong><i class="chart-key" style="background:${colors[i % colors.length]}" aria-hidden="true"></i>${esc(c.class_name)}</strong><span>${number(c.student_count)} siswa menyetor</span><div class="rank-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, c.total_kg / max * 100))}%;background:${colors[i % colors.length]}"></i></div></div><span class="rank-weight">${number(c.total_kg)} kg</span></li>`).join("") : '<li class="empty-ranking">Belum ada kelas aktif.</li>';
  const studentMax = Math.max(1, ...data.top_students.map(s => s.total_kg), ...data.bottom_students.map(s => s.total_kg));
  const renderStudents = (rows: RankedStudent[], empty: string) => rows.length ? rows.map((s, i) => `<li><span class="rank-number">${i + 1}</span><div class="rank-person"><strong>${esc(s.full_name)}</strong><span>${esc(s.class_name)}${s.total_kg === 0 ? " · Belum menyetor" : ""}</span><div class="rank-bar student-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, s.total_kg / studentMax * 100))}%"></i></div></div><span class="rank-weight">${number(s.total_kg)} kg</span></li>`).join("") : `<li class="empty-ranking">${empty}</li>`;
  el("top-students").innerHTML = renderStudents(data.top_students, "Belum ada setoran pada periode ini.");
  el("bottom-students").innerHTML = renderStudents(data.bottom_students, "Belum ada siswa aktif dalam kelas.");
  el("ranking-updated").textContent = `Diperbarui ${new Intl.DateTimeFormat("id-ID", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(data.as_of))}`;
  updateMeasurement();
}
async function loadDashboard(silent = false) {
  if (!portal.connected || view === "login") return;
  if (portal.context!.id !== activePortalId) { window.location.reload(); return; }
  const schoolId = portal.context!.school_id;
  const requestId = ++dashboardRequest;
  if (!silent) el<HTMLButtonElement>("btn-refresh").disabled = true;
  el("ranking-content").setAttribute("aria-busy", "true");
  try {
    const data = await portal.request<Dashboard>(`/waste/dashboard?period=${input<HTMLSelectElement>("ranking-period").value}`);
    if (requestId !== dashboardRequest || !portal.connected) return;
    if (portal.context?.school_id !== schoolId || data.school_id !== schoolId) {
      dashboard = null;
      el("ranking-content").hidden = true;
      if (!silent) throw new PortalError("Konteks sekolah berubah. Muat ulang halaman sebelum melihat data.", 403, "PORTAL_MISMATCH");
      return;
    }
    dashboard = data; renderDashboard(data);
    el("ranking-content").hidden = false;
    el("dashboard-error").textContent = ""; el("ranking-error").textContent = "";
  } catch (error) {
    if (requestId !== dashboardRequest) return;
    if (silent) return; // Silent background refresh never disrupts UI or pops banners!
    clearDailySummary();
    if (error instanceof PortalError && (error.status === 401 || error.status === 403)) {
      switchView("scan");
      el("scan-error").style.display = "block";
      el("scan-error").textContent = message(error);
      return;
    }
    const text = `Data belum diperbarui. ${message(error)}`;
    el("dashboard-error").textContent = text; el("ranking-error").textContent = text;
    el("ranking-updated").textContent = "Pembaruan gagal · tekan Perbarui untuk mencoba lagi";
    if (!dashboard || dashboard.period !== input<HTMLSelectElement>("ranking-period").value) el("ranking-content").hidden = true;
  } finally {
    if (requestId === dashboardRequest) {
      el<HTMLButtonElement>("btn-refresh").disabled = false;
      el("ranking-content").setAttribute("aria-busy", "false");
    }
  }
}
async function init() {
  updateOfflineStatus();
  clearDailySummary();
  let initialRestored = false;
  try {
    const activeSaved = JSON.parse(sessionStorage.getItem(activeSessionKey()) ?? "null") as { student: Student; view: View } | null;
    if (activeSaved?.student?.id && activeSaved.view === "input") {
      showStudent(activeSaved.student);
      switchView("input");
      updateMeasurement();
      initialRestored = true;
    }
  } catch { /* Ignore */ }

  if (!initialRestored) {
    switchView("scan");
  }

  // Tahap 3: Popup Install Aplikasi langsung tampil bersamaan saat PWA muncul di browser
  // agar user bisa langsung mengambil tindakan tanpa menunggu proses penarikan data selesai
  if (!isInstalled()) {
    void promptOrOfferInstall();
  }

  const schoolEl = document.getElementById("school-name");
  const classEl = document.getElementById("class-name-label");

  const isLoginFlow = new URL(window.location.href).searchParams.has("token") || new URL(window.location.href).hash.includes("token");

  const setupUI = async () => {
    classId = portal.context!.metadata.class_id ?? "";
    activePortalId = portal.context!.id;
    if (!classId) throw new Error("QR belum terhubung ke kelas. Hubungi admin sekolah.");

    const cachedClass = localStorage.getItem(`aksis.waste.class.${classId}`);
    if (cachedClass) {
      className = cachedClass;
      if (classEl) classEl.textContent = `Kelas ${className.replace(/^(?:kelas\s+)+/i, "").trim()}`;
      el("staff-label").textContent = `Piket ${className}`;
    }
    if (schoolEl && portal.context?.school_name) schoolEl.textContent = portal.context.school_name;
    if (portal.context?.school_name) el("today-scope").textContent = `Semua kelas di ${portal.context.school_name}`;

    showSyncBar(true);
    try {
      const cls = await portal.request<{ name: string }>(`/classes/${classId}`);
      className = cls.name;
      try { localStorage.setItem(`aksis.waste.class.${classId}`, className); } catch {}
      if (classEl) classEl.textContent = `Kelas ${className.replace(/^(?:kelas\s+)+/i, "").trim()}`;
      if (schoolEl) schoolEl.textContent = portal.context!.school_name;
      el("today-scope").textContent = `Semua kelas di ${portal.context!.school_name}`;
      el("staff-label").textContent = `Piket ${className}`;

      // Penarikan data siswa sesuai kelas portal PWA Piket Sampah (terisolasi per tenant dan kelas)
      await syncPortalRoster(portal, studentCache, true);
    } catch {
      if (cachedClass) {
        className = cachedClass;
        if (classEl) classEl.textContent = `Kelas ${className.replace(/^(?:kelas\s+)+/i, "").trim()}`;
      }
    } finally {
      showSyncBar(false);
    }

    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey()) ?? "null") as { pending: PendingDeposit; student: Student } | null;
      if (saved?.pending.class_id === classId && saved.student.id === saved.pending.student_id) {
        pending = saved.pending; showStudent(saved.student);
        input("weight-input").value = String(pending.organic_kg + pending.inorganic_kg);
        input<HTMLSelectElement>("unit-select").value = "KG";
        document.querySelector<HTMLInputElement>(`input[value="${pending.organic_kg > 0 ? "ORGANIC" : "INORGANIC"}"]`)!.checked = true;
        lockForm(true); switchView("input"); updateMeasurement();
        el("input-error").textContent = "Ada setoran yang belum terkonfirmasi. Tekan Simpan Setoran untuk memeriksa atau mengulang tanpa menggandakan data.";
      } else if (!initialRestored) {
        const activeSaved = JSON.parse(sessionStorage.getItem(activeSessionKey()) ?? "null") as { student: Student; view: View } | null;
        if (activeSaved?.student?.id && activeSaved.view === "input") {
          showStudent(activeSaved.student);
          switchView("input");
          updateMeasurement();
        } else {
          switchView("scan");
        }
      }
    } catch { /* Ignore */ }

    hideInitialLoader();
    void loadDashboard(true);
  };

  if (portal.connected && !isLoginFlow) {
    if (schoolEl && portal.context?.school_name) schoolEl.textContent = portal.context.school_name;
    const cachedClass = localStorage.getItem(`aksis.waste.class.${portal.context!.metadata.class_id}`);
    if (classEl && cachedClass) classEl.textContent = `Kelas ${cachedClass.replace(/^(?:kelas\s+)+/i, "").trim()}`;

    try {
      await portal.start();
      await setupUI();
      hideInitialLoader();
      return;
    } catch (error) {
      hideInitialLoader();
      if (!initialRestored) switchView("scan");
      return;
    }
  }

  if (schoolEl) schoolEl.textContent = "Menghubungkan...";
  if (classEl) classEl.textContent = "Memuat data kelas";

  try {
    if (!await portal.start()) {
      hideInitialLoader();
      if (!initialRestored) switchView("login");
      return;
    }
    await setupUI();
    hideInitialLoader();
  } catch (error) {
    hideInitialLoader();
    if (!initialRestored) switchView("scan");
  }
}

let syncingWaste = false;
let syncBackoffUntil = 0;

async function syncWasteQueue() {
  if (syncingWaste) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (Date.now() < syncBackoffUntil) return;

  const scope = wasteQueue.currentScope;
  try {
    const pendingItems = await wasteQueue.getPending(scope);
    if (!pendingItems.length) return;

    syncingWaste = true;
    showSyncBar(true);
    for (const item of pendingItems) {
      if (scope !== wasteQueue.currentScope) break;
      if (typeof navigator !== "undefined" && !navigator.onLine) break;

      try {
        await portal.request("/waste/transactions", {
          method: "POST",
          body: JSON.stringify({
            event_id: item.event_id,
            class_id: item.payload.class_id,
            student_id: item.payload.student_id,
            organic_kg: item.payload.organic_kg,
            inorganic_kg: item.payload.inorganic_kg,
            source: item.payload.source,
          }),
        });
        await wasteQueue.markSynced(item.event_id, scope);
      } catch (err) {
        if (err instanceof PortalError && (err.status === 429 || err.status >= 500)) {
          // Server rate limit or high concurrency load: pause with randomized jitter
          syncBackoffUntil = Date.now() + 20_000 + Math.floor(Math.random() * 15_000);
          break;
        } else if (err instanceof PortalError && err.status >= 400 && err.status < 500) {
          // Permanent rejection (e.g. invalid student or portal mismatch): record failed in IDB without popping banners
          await wasteQueue.markFailed(item.event_id, err.message, scope);
          console.warn("[Piket Sampah Sync] Setoran ditolak server:", err.message);
          continue;
        } else {
          // Network interruption / timeout: keep safe in IndexedDB silently
          break;
        }
      }
    }

    if (view === "ranking" && !document.hidden) {
      void loadDashboard(true);
    }
  } catch {
    /* Storage or network error: retain items safely in IndexedDB */
  } finally {
    syncingWaste = false;
    showSyncBar(false);
  }
}

async function resolveStudent(scannedText?: string) {
  const query = (scannedText ?? input("scan-input").value).trim();
  resumeCameraAfterDeposit = Boolean(scannedText);
  if (!query || resolving || pending) return;

  hideNotFoundModal();
  el("scan-error").style.display = "none";
  el("scan-error").textContent = "";

  // 1. FAST PATH (Instant on-device resolution without spinner in <1ms)
  const cached = studentCache.resolve(query);
  if (cached) {
    if (!scannedText) {
      input("scan-input").value = "";
    }
    const resolvedStudent: Student = {
      id: cached.id,
      full_name: cached.full_name,
      student_number: cached.student_number ?? "",
      nisn: cached.nisn,
      photo_url: cached.photo_url,
    };
    showStudent(resolvedStudent);
    speaker.speak(resolvedStudent.full_name);
    el("scan-error").style.display = "none";
    el("scan-error").textContent = "";
    el("input-error").textContent = "";
    input("weight-input").value = "0.500";
    input<HTMLSelectElement>("unit-select").value = "KG";
    const organicInput = document.querySelector<HTMLInputElement>('input[value="ORGANIC"]');
    if (organicInput) organicInput.checked = true;
    updateMeasurement();
    switchView("input");
    return;
  }

  // If not found in cache and device is offline / power outage (mati lampu)
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    el("not-found-msg-text").textContent = `Siswa tidak ditemukan dalam daftar kelas piket ${className || "ini"}. Saat mode offline/mati lampu, pastikan kartu siswa terdaftar di kelas ini.`;
    el("modal-not-found").style.display = "flex";
    return;
  }

  // 2. FALLBACK PATH (Online resolution for newly assigned cards)
  resolving = true;
  showLoadingOverlay(true);
  el<HTMLButtonElement>("btn-ranking").disabled = true;

  try {
    const resolvedStudent = await portal.request<Student>("/students/resolve", { method:"POST", body:JSON.stringify({identity:query}) });
    studentCache.put({
      id: resolvedStudent.id,
      full_name: resolvedStudent.full_name,
      student_number: resolvedStudent.student_number,
      nisn: resolvedStudent.nisn,
      photo_url: resolvedStudent.photo_url,
      cards: [{ card_uid: query, qr_key: query }],
    });

    if (!scannedText) {
      input("scan-input").value = "";
    }

    showStudent(resolvedStudent);
    speaker.speak(resolvedStudent.full_name);
    el("scan-error").style.display = "none";
    el("scan-error").textContent = "";
    el("input-error").textContent = "";
    input("weight-input").value = "0.500";
    input<HTMLSelectElement>("unit-select").value = "KG";
    const organicInput = document.querySelector<HTMLInputElement>('input[value="ORGANIC"]');
    if (organicInput) organicInput.checked = true;
    updateMeasurement();
    switchView("input");
  } catch (error) {
    const errMsg = message(error);
    el("not-found-msg-text").textContent = errMsg;
    el("modal-not-found").style.display = "flex";
  } finally {
    resolving = false;
    showLoadingOverlay(false);
    el<HTMLButtonElement>("btn-ranking").disabled = false;
  }
}

function lockForm(locked: boolean) {
  el("form-input").querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button[type=button]").forEach(control => control.disabled = locked);
  el<HTMLButtonElement>("btn-cancel-input").disabled = locked;
}

async function saveDeposit(e: SubmitEvent) {
  e.preventDefault();
  if (saving || !student) return;
  const measurement = updateMeasurement();
  if (!Number.isFinite(measurement.total_kg) || measurement.total_kg <= 0 || measurement.total_kg > 1000) {
    el("input-error").textContent = "Berat harus lebih dari 0 dan maksimal 1.000 kg.";
    return;
  }

  const depositPayload = {
    event_id: crypto.randomUUID(),
    class_id: classId,
    student_id: student.id,
    student_name: student.full_name,
    organic_kg: measurement.organic_kg,
    inorganic_kg: measurement.inorganic_kg,
    source: measurement.source,
    total_kg: measurement.total_kg,
    occurred_at: new Date().toISOString(),
  };

  // Enqueue locally first so line never blocks on network
  saving = true;
  try { await wasteQueue.enqueue(depositPayload, depositPayload.event_id); }
  catch { el("input-error").textContent = "Gagal menyimpan di perangkat. Periksa ruang penyimpanan dan coba lagi."; return; }
  finally { saving = false; }

  speaker.speak("Setoran berhasil disimpan");
  el("success-detail").textContent = `${student.full_name} · ${number(measurement.total_kg)} kg. Setoran tersimpan di HP & sinkronisasi berjalan di latar belakang.`;
  pending = null;
  rememberPending();
  student = null;
  el("input-error").textContent = "";
  lockForm(false);
  switchView("scan");
  el("scan-status").textContent = "Setoran tersimpan di HP · siap memindai siswa berikutnya.";
  if (resumeCameraAfterDeposit) void startCamera();

  // Non-blocking silent background sync with slight jitter
  scheduleSilentSync(1000 + Math.floor(Math.random() * 1500));
}
loginForm.addEventListener("submit", e => { e.preventDefault(); void init(); });
el("form-scan").addEventListener("submit", e => { e.preventDefault(); void resolveStudent(); });
el<HTMLFormElement>("form-input").addEventListener("submit", saveDeposit);
el("form-input").addEventListener("input", updateMeasurement);
el("btn-toggle-camera").addEventListener("click", () => { if (scanning) void stopCamera(); else void startCamera(); });
el("btn-switch-camera").addEventListener("click", async () => {
  if (cameraBusy) return;
  await stopCamera(); facing = facing === "environment" ? "user" : "environment";
  el("btn-switch-camera").querySelector("span")!.textContent = facing === "environment" ? "Kamera belakang" : "Kamera depan";
  void startCamera();
});
el("btn-rescan-qr").addEventListener("click", () => {
  hideNotFoundModal();
  input("scan-input").value = "";
  if (!scanning) {
    void startCamera();
  }
});
el("btn-close-not-found").addEventListener("click", () => {
  hideNotFoundModal();
  input("scan-input").focus();
});
for (const [id, delta] of [["weight-minus", -.1], ["weight-plus", .1]] as const) el(id).addEventListener("click", () => {
  input("weight-input").value = Math.max(.001, Math.min(1000, Number(input("weight-input").value) + delta)).toFixed(3); updateMeasurement();
});
el("btn-cancel-input").addEventListener("click", () => { if (!pending) { student = null; switchView("scan"); } });
el("btn-next-scan").addEventListener("click", () => { student = null; switchView("scan"); });
el("btn-ranking").addEventListener("click", () => { switchView("ranking"); void loadDashboard(); });
const depBtn = document.getElementById("btn-deposit");
if (depBtn) depBtn.addEventListener("click", () => switchView(student && view !== "success" ? "input" : "scan"));
const floatBtn = document.getElementById("btn-deposit-floating");
if (floatBtn) floatBtn.addEventListener("click", () => switchView(student && view !== "success" ? "input" : "scan"));
el("btn-refresh").addEventListener("click", () => void loadDashboard());
el("ranking-period").addEventListener("change", () => { el("ranking-content").hidden = true; el("ranking-updated").textContent = "Memuat periode…"; void loadDashboard(); });
el("btn-fullscreen").addEventListener("click", async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.body.requestFullscreen(); }
  catch { el("ranking-error").textContent = "Layar penuh tidak didukung browser ini. Gunakan mode lanskap untuk tampilan lebih luas."; }
});
document.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("board-mode", Boolean(document.fullscreenElement));
  el("btn-fullscreen").textContent = document.fullscreenElement ? "⛶ Keluar layar penuh" : "⛶ Layar penuh";
});
document.querySelectorAll<HTMLButtonElement>(".zoom-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const zoomVal = Number(btn.getAttribute("data-zoom")) || 1;
    void setCameraZoom(zoomVal);
  });
});
setupScannerPinchZoom();

// Silent Adaptive Background Synchronization
let syncTimer: number | undefined;
function scheduleSilentSync(delayMs?: number) {
  if (syncTimer) clearTimeout(syncTimer);
  // Default randomized interval between 12 and 18 seconds with jitter to protect server against concurrent storms
  const delay = delayMs ?? (12_000 + Math.floor(Math.random() * 6_000));
  syncTimer = window.setTimeout(async () => {
    await syncWasteQueue();
    scheduleSilentSync();
  }, delay);
}

window.addEventListener("online", () => {
  updateOfflineStatus();
  scheduleSilentSync(1500 + Math.floor(Math.random() * 3000));
  void syncPortalRoster(portal, studentCache);
  if (view === "ranking") void loadDashboard(true);
});

window.addEventListener("offline", () => {
  updateOfflineStatus();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    void stopCamera();
  } else {
    scheduleSilentSync(1000 + Math.floor(Math.random() * 2000));
    if (view === "ranking") void loadDashboard(true);
  }
});

// Periodic dashboard refresh only when actively viewing ranking screen
window.setInterval(() => {
  if (!document.hidden && view === "ranking") {
    void loadDashboard(true);
  }
}, 120_000 + Math.floor(Math.random() * 30_000));

void init();
scheduleSilentSync();
startRosterRefresh(portal, studentCache);
