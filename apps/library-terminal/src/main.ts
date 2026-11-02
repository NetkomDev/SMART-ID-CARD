import { DurableQueue } from "../../shared/durable-queue";
import { StudentCache, startRosterRefresh, type CachedStudent } from "../../shared/offline-store";
import { QRCamera, bindLoginCamera } from "../../shared/qr-camera";
import { renderPortrait } from "../../shared/portrait";
import { gateIntro, gateHelp } from "../../shared/portal-ui";
import { NaturalVoice } from "../../shared/natural-voice";
import "./style.css";
import "../../shared/scanner.css";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, promptOrOfferInstall, isInstalled } from "../../shared/install-prompt";

function showLoadingOverlay(show: boolean, text = "Memproses...") {
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
}

const portal = new PortalSession("LIBRARY_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
const studentCache = new StudentCache(() => "library:" + (portal.context?.school_id ?? "none") + ":" + (portal.context?.id ?? "none"));
setupInstallPrompt("Perpustakaan", import.meta.env.BASE_URL, import.meta.env.PROD);

const speaker = new NaturalVoice("perpustakaan", ({ enabled, text, hasVoice }) => {
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
const queueKey = () => `library:${portal.context?.school_id ?? "none"}:${portal.context?.id ?? "none"}`;
const visits = new DurableQueue<Visit>(queueKey);
async function updateVisitCount() { queued.textContent = String((await visits.getPending()).length); }
async function migrateVisitQueue() {
  const key=`aksis.library.queue.${portal.context?.id ?? "none"}`;
  const raw=localStorage.getItem(key);if(!raw)return;
  const legacy=JSON.parse(raw) as Visit[];
  const existing=new Set((await visits.getPending()).map(item=>item.event_id));
  for(const visit of legacy)if(!existing.has(visit.event_id))await visits.enqueue(visit,visit.event_id);
  localStorage.removeItem(key);
}

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
    const scope=queueKey();
    await migrateVisitQueue();
    const items=await visits.getPending(scope);
    for(const item of items) {
      if(scope!==queueKey())break;
      const visit=item.payload;
      try {
        const result=await portal.request<{student_id?:string;student_name?:string;class_name?:string;photo_url?:string}>("/library/visits",{method:"POST",body:JSON.stringify(visit)});
        if(result?.student_name&&result.student_id)studentCache.put({id:result.student_id,full_name:result.student_name,class_name:result.class_name,photo_url:result.photo_url,cards:[{card_uid:visit.card_uid,qr_key:visit.card_uid}]});
        await visits.markSynced(item.event_id,scope);
      } catch(error) {
        await visits.markFailed(item.event_id,error instanceof Error?error.message:"Sinkronisasi gagal",scope);
        if (error instanceof PortalError && error.status >= 400 && error.status < 500 && error.status !== 429) continue;
        break;
      }
    }
    const remaining=(await visits.getPending(scope)).length;
    if(scope===queueKey()){queued.textContent=String(remaining);status.value=remaining?`${remaining} kunjungan menunggu sinkronisasi atau pemeriksaan`:"Semua kunjungan tersinkronisasi";}
    void loadDailySummary();
  };
  syncing=Promise.resolve(navigator.locks?navigator.locks.request(queueKey(),work):work()).then(()=>undefined).finally(()=>{syncing=null;});return syncing;
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
let lastScannedStudent: CachedStudent | null = null;
let selectedLoanStudent: CachedStudent | null = null;
let isLoanScanning = false;

function renderLoanStudentPreview(student: CachedStudent | null) {
  selectedLoanStudent = student;
  const preview = document.getElementById("loan-student-result") || document.getElementById("loan-student-preview");
  const avatar = document.getElementById("loan-student-avatar");
  const name = document.getElementById("loan-student-name");
  const meta = document.getElementById("loan-student-meta");
  const input = document.getElementById("loan-student") as HTMLInputElement | null;

  if (!preview || !avatar || !name || !meta) return;

  if (student) {
    preview.style.display = "block";
    name.textContent = student.full_name;
    const nisnText = student.nisn ? `NISN: ${student.nisn}` : (student.student_number ? `No: ${student.student_number}` : "");
    const classText = student.class_name ? `Kelas: ${student.class_name}` : "";
    meta.textContent = [classText, nisnText].filter(Boolean).join(" · ") || "Siswa Terverifikasi";
    if (student.photo_url) {
      renderPortrait(avatar, student.photo_url);
    } else {
      avatar.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
    }
    if (input) {
      input.value = student.nisn || student.student_number || student.id;
    }
  } else {
    preview.style.display = "none";
    avatar.replaceChildren();
    name.textContent = "-";
    meta.textContent = "-";
  }
}

function selectLoanStudent(student: CachedStudent | null) {
  renderLoanStudentPreview(student);
  if (student) {
    speaker.speak(`Peminjaman buku untuk ${student.full_name}`);
    loanStatus.textContent = `Siswa terpilih: ${student.full_name}`;
    (document.getElementById("loan-title") as HTMLInputElement | null)?.focus();
  }
}
async function processVisit(uid: string, isFromCamera: boolean = false) {
  if (visitBusy) return;
  visitBusy = true;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submit.disabled = true;

  const visit: Visit = {
    event_id: crypto.randomUUID(),
    card_uid: uid,
    occurred_at: new Date().toISOString(),
    local_sequence: Date.now(),
    metadata: { terminal: "library-pwa" },
  };

  // 1. FAST PATH (Instant on-device queue & cache resolution)
  if (isFromCamera) {
    triggerHapticFeedback();
    const flash = document.getElementById("camera-shutter-flash");
    if (flash) {
      flash.classList.remove("flash-active");
      void flash.offsetWidth;
      flash.classList.add("flash-active");
    }
  }

  let cached = studentCache.resolve(uid);
  if (!cached && !navigator.onLine) {
    status.value = "Siswa belum tersedia di perangkat. Hubungkan internet untuk mengenali kartu.";
    visitBusy = false; submit.disabled = false; return;
  }
  try { await visits.enqueue(visit,visit.event_id); await updateVisitCount(); }
  catch { status.value = "Gagal menyimpan di perangkat. Periksa ruang penyimpanan."; visitBusy = false; submit.disabled = false; return; }
  if (!cached) {
    await sync();
    cached = studentCache.resolve(uid);
    if (!cached) {
      status.value = "Kartu belum dapat diverifikasi. Periksa koneksi atau antrean.";
      visitBusy = false; submit.disabled = false; return;
    }
  }
  lastScannedStudent = cached;
  const studentName = cached.full_name;
  renderLoanStudentPreview(cached);
  const className = cached?.class_name ?? "—";

  document.getElementById("success-student-name")!.textContent = studentName;
  document.getElementById("success-student-class")!.textContent = className;

  const visitTimeText = `Tercatat pukul ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
  document.getElementById("success-visit-time")!.textContent = visitTimeText;

  const dupEl = document.getElementById("duplicate-warning");
  if (dupEl) dupEl.style.display = "none";

  const avatarEl = document.getElementById("student-avatar");
  if (avatarEl) {
    if (cached?.photo_url) {
      renderPortrait(avatarEl, cached.photo_url);
    } else {
      avatarEl.innerHTML = `<div class="avatar-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg></div>`;
    }
  }

  // Instant human voice recitation
  speaker.speak(`Selamat datang, ${studentName}`);

  status.value = "Kunjungan tersimpan di HP · sinkronisasi berjalan di latar belakang.";
  switchView("success");
  if (!isFromCamera) triggerHapticFeedback();

  // Rapid auto-reset so next student in line can be scanned immediately
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = window.setTimeout(() => switchView("scan"), 1800);

  visitBusy = false;
  submit.disabled = false;

  // 2. SILENT BACKGROUND SYNC (Non-blocking)
  void sync();
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

const camera = new QRCamera({readerId:"qr-reader",toggleId:"btn-toggle-camera",stageId:"scanner-stage",placeholderId:"scanner-placeholder",statusId:"scan-status",errorId:"status",zoomId:"zoom-controls",once:true,canRead:()=>!visitBusy && document.getElementById("view-success")!.style.display!=="flex" && document.getElementById("error-overlay")!.style.display!=="flex",onState:phase=>{isScanning=phase==="active";},onDecode:async value=>{await processVisit(value,true);}});
async function stopCameraScanner(){await camera.stop();currentZoom=1;}
async function startCameraScanner(){await camera.start();}
document.getElementById("btn-switch-camera")!.addEventListener("click",()=>{void camera.flip();});
document.addEventListener("visibilitychange",()=>{if(document.hidden){void stopCameraScanner();void stopLoanCameraScanner();}});
window.addEventListener("pagehide",()=>{void stopCameraScanner();void stopLoanCameraScanner();});

document.getElementById("btn-toggle-camera")!.addEventListener("click", () => {
  if (isScanning) stopCameraScanner();
  else startCameraScanner();
});

async function start() {
  if (!isInstalled()) {
    void promptOrOfferInstall();
  }
  try {
    const isLoginFlow = new URL(window.location.href).searchParams.has("token") || new URL(window.location.href).hash.includes("token");

    if (portal.connected && !isLoginFlow) {
      panel.hidden = false;
      login.style.display = "none";
      const libSchool = document.querySelector("#library-school");
      if (libSchool && portal.context) libSchool.textContent = portal.context.school_name;
      const libLoanSchool = document.querySelector("#library-loan-school");
      if (libLoanSchool && portal.context) libLoanSchool.textContent = portal.context.school_name;
      void updateVisitCount();
      if (!navigator.onLine) { status.value = "Offline · transaksi tersimpan di HP"; return; }
      
      showLoadingOverlay(true, "Memproses...");
      try {
        await Promise.all([
          portal.start(),
          loadDailySummary()
        ]);
      } finally {
        showLoadingOverlay(false);
      }
      
      if (libSchool && portal.context) libSchool.textContent = portal.context.school_name;
      if (libLoanSchool && portal.context) libLoanSchool.textContent = portal.context.school_name;
      void sync().catch(showError);
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
    const libLoanSchool = document.querySelector("#library-loan-school");
    if (libLoanSchool) libLoanSchool.textContent = portal.context!.school_name;
    void updateVisitCount();
    showLoadingOverlay(true, "Memproses...");
    try {
      await loadDailySummary();
    } finally {
      showLoadingOverlay(false);
    }
    void sync().catch(showError);
  } catch (error) {
    showLoadingOverlay(false);
    panel.hidden = true;
    login.style.display = "block";
    document.getElementById("login-error")!.textContent = error instanceof Error ? error.message : "Belum dapat terhubung.";
  }
}

void start();

// Background sync loop: sync quietly every 8.5 seconds without blocking scanner
const SYNC_INTERVAL_MS = 8500;
window.setInterval(() => {
  if (portal.connected) void sync().catch(() => {});
}, SYNC_INTERVAL_MS);

window.addEventListener("online", () => {
  if (portal.connected) {
    void sync().catch(() => {});
    void loadDailySummary();
  }
});

// Loan events use per-event IndexedDB records so retries cannot replace another queued event.
type Loan = { event_id:string; student_id:string; student_name:string; book_title:string; book_author:string; borrowed_at:string; due_date:string };
const loanScope = () => `${portal.context?.school_id ?? "none"}:${portal.context?.id ?? "none"}`;
const loanDb = new Promise<IDBDatabase>((resolve,reject) => {
  const request=indexedDB.open("aksis-library-loans-v1",1);
  request.onupgradeneeded=()=>request.result.createObjectStore("events",{keyPath:"key"});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function loanOperation<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await loanDb; return new Promise((resolve,reject)=>{const tx=db.transaction("events",mode);const request=action(tx.objectStore("events"));let result:T;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
async function queuedLoans(scope=loanScope()):Promise<Loan[]> {
  const rows=await loanOperation("readonly",store=>store.getAll()) as Array<{scope:string;loan:Loan}>;
  return rows.filter(row=>row.scope===scope).map(row=>row.loan);
}
let syncingLoans=false;
async function syncLoans() {
  if(syncingLoans || !navigator.onLine || !portal.context)return;
  syncingLoans=true;const scope=loanScope();
  try {for(const loan of await queuedLoans(scope)){
    if(scope!==loanScope())break;
    try {const {student_name:_,...payload}=loan;await portal.request("/library/loans",{method:"POST",body:JSON.stringify(payload)});await loanOperation("readwrite",store=>store.delete(`${scope}:${loan.event_id}`));}
    catch {break;}
  }} finally {syncingLoans=false;}
}
async function renderLoans() {
  const target=document.getElementById("loan-list")!;const scope=loanScope();
  let remote:Loan[]=[];try{remote=await portal.request<Loan[]>("/library/loans");}catch{/* offline: retain local events */}
  if(scope!==loanScope())return;
  const pending=await queuedLoans(scope);target.replaceChildren();
  const seen=new Set(remote.map(x=>x.event_id));
  const rows=[...pending.filter(x=>!seen.has(x.event_id)).map(x=>({loan:x,pending:true})),...remote.map(x=>({loan:x,pending:false}))];
  if(!rows.length){target.textContent=navigator.onLine?"Belum ada peminjaman aktif.":"Tidak ada pinjaman lokal yang menunggu sinkronisasi.";return;}
  for(const row of rows){const el=document.createElement("div");el.className="loan-item";const title=document.createElement("strong");title.textContent=row.loan.book_title;const details=document.createElement("span");details.textContent=`${row.loan.book_author} · ${row.loan.student_name} · Jatuh tempo ${row.loan.due_date}${row.pending?" · menunggu sinkronisasi":""}`;el.append(title,details);target.append(el);}
}
const loanForm=document.getElementById("loan-form") as HTMLFormElement;
const loanStatus=document.getElementById("loan-status")!;

let currentLoanZoom = 1;
let initialLoanTouchDistance = 0;
let initialLoanZoomOnTouch = 1;

async function setLoanCameraZoom(value: number) {
  currentLoanZoom = value;
  await loanCamera.setZoom(value);
}

function triggerLoanShutterFlash() {
  const flash = document.getElementById("loan-camera-shutter-flash");
  if (flash) {
    flash.classList.remove("flash-active");
    void flash.offsetWidth;
    flash.classList.add("flash-active");
  }
}

function setupLoanScannerPinchZoom() {
  const stage = document.querySelector<HTMLElement>("#loan-scanner-stage .scanner-viewport");
  if (!stage) return;

  const handleTouchStart = (e: TouchEvent) => {
    const target = e.target as HTMLElement | null;
    const isInside = target && (stage.contains(target) || !!target.closest("#loan-scanner-stage, #loan-qr-reader"));
    if (isInside && e.touches.length === 2 && isLoanScanning) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      initialLoanTouchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      initialLoanZoomOnTouch = currentLoanZoom;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && isLoanScanning && initialLoanTouchDistance > 0) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const zoomFactor = currentDistance / initialLoanTouchDistance;
      const newZoom = initialLoanZoomOnTouch * zoomFactor;
      void setLoanCameraZoom(newZoom);
    }
  };

  const handleTouchEnd = () => { initialLoanTouchDistance = 0; };

  document.addEventListener("touchstart", handleTouchStart, { passive: false });
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });
  document.addEventListener("touchcancel", handleTouchEnd, { passive: true });
}

const loanCamera = new QRCamera({
  readerId: "loan-qr-reader",
  toggleId: "btn-toggle-loan-camera",
  stageId: "loan-scanner-stage",
  placeholderId: "loan-scanner-placeholder",
  statusId: "loan-scan-status",
  errorId: "loan-status",
  zoomId: "loan-zoom-controls",
  once: true,
  canRead: () => document.getElementById("view-loans")?.hidden === false,
  onState: phase => {
    isLoanScanning = phase === "active";
  },
  onDecode: async value => {
    triggerLoanShutterFlash();
    triggerHapticFeedback();
    let student = studentCache.resolve(value);
    if (!student && navigator.onLine) {
      try {
        const res = await portal.request<{ student_id?: string; student_name?: string; class_name?: string; photo_url?: string; nisn?: string }>(
          `/students/resolve?identifier=${encodeURIComponent(value)}`
        );
        if (res?.student_id && res.student_name) {
          student = {
            id: res.student_id,
            full_name: res.student_name,
            class_name: res.class_name,
            photo_url: res.photo_url,
            nisn: res.nisn,
          };
          studentCache.put(student);
        }
      } catch {}
    }
    if (student) {
      selectLoanStudent(student);
    } else {
      const input = document.getElementById("loan-student") as HTMLInputElement | null;
      if (input) input.value = value;
      loanStatus.textContent = "QR terbaca. Siswa belum ada di cache, periksa koneksi atau antrean.";
    }
  }
});

async function stopLoanCameraScanner() {
  await loanCamera.stop();
  currentLoanZoom = 1;
}

async function startLoanCameraScanner() {
  if (isScanning) await stopCameraScanner();
  await loanCamera.start();
}

document.getElementById("btn-switch-loan-camera")?.addEventListener("click", () => {
  void loanCamera.flip();
});

document.getElementById("btn-toggle-loan-camera")?.addEventListener("click", () => {
  if (isLoanScanning) void stopLoanCameraScanner();
  else void startLoanCameraScanner();
});

document.querySelectorAll<HTMLButtonElement>("#loan-zoom-controls .zoom-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const zoomVal = Number(btn.getAttribute("data-zoom")) || 1;
    void setLoanCameraZoom(zoomVal);
  });
});

setupLoanScannerPinchZoom();

document.getElementById("btn-clear-loan-student")?.addEventListener("click", () => {
  renderLoanStudentPreview(null);
  const input = document.getElementById("loan-student") as HTMLInputElement | null;
  if (input) {
    input.value = "";
    input.focus();
  }
  loanStatus.textContent = "";
});

async function lookupLoanStudentManual() {
  const input = document.getElementById("loan-student") as HTMLInputElement | null;
  const val = input?.value.trim();
  if (!val) {
    loanStatus.textContent = "Masukkan NISN atau ID kartu siswa.";
    return;
  }
  let student = studentCache.resolve(val);
  if (!student && navigator.onLine) {
    loanStatus.textContent = "Mencari data siswa…";
    try {
      const res = await portal.request<{ student_id?: string; student_name?: string; class_name?: string; photo_url?: string; nisn?: string }>(
        `/students/resolve?identifier=${encodeURIComponent(val)}`
      );
      if (res?.student_id && res.student_name) {
        student = {
          id: res.student_id,
          full_name: res.student_name,
          class_name: res.class_name,
          photo_url: res.photo_url,
          nisn: res.nisn,
        };
        studentCache.put(student);
      }
    } catch {}
  }
  if (student) {
    selectLoanStudent(student);
  } else {
    renderLoanStudentPreview(null);
    loanStatus.textContent = "Siswa tidak ditemukan. Periksa NISN atau koneksi.";
  }
}

document.getElementById("btn-loan-find-student")?.addEventListener("click", () => {
  void lookupLoanStudentManual();
});

const loanStudentInput = document.getElementById("loan-student") as HTMLInputElement | null;
loanStudentInput?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    void lookupLoanStudentManual();
  }
});

let lookupTimer: number | undefined;
loanStudentInput?.addEventListener("input", () => {
  if (lookupTimer) clearTimeout(lookupTimer);
  lookupTimer = window.setTimeout(() => {
    const val = loanStudentInput.value.trim();
    if (!val) {
      renderLoanStudentPreview(null);
      return;
    }
    const student = studentCache.resolve(val);
    if (student) {
      renderLoanStudentPreview(student);
      loanStatus.textContent = `Siswa ditemukan: ${student.full_name}`;
    }
  }, 250);
});

// Quick loan from visit success modal
document.getElementById("btn-loan-from-visit")?.addEventListener("click", () => {
  switchView("scan");
  setLibraryTab("loans");
  if (lastScannedStudent) {
    selectLoanStudent(lastScannedStudent);
  }
});

loanForm.addEventListener("submit",async event=>{
  event.preventDefault();if(!portal.context)return;
  const value=(id:string)=>(document.getElementById(id) as HTMLInputElement).value.trim();
  const student = selectedLoanStudent || studentCache.resolve(value("loan-student"));
  if(!student){loanStatus.textContent="Siswa belum dikenali. Pindai kartu siswa dengan kamera di atas atau masukkan NISN yang terdaftar.";return;}
  const loan:Loan={event_id:crypto.randomUUID(),student_id:student.id,student_name:student.full_name,book_title:value("loan-title"),book_author:value("loan-author"),borrowed_at:new Date().toISOString(),due_date:value("loan-due")};
  if(!loan.book_title||!loan.book_author||!loan.due_date){loanStatus.textContent="Lengkapi data buku dan jatuh tempo.";return;}
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(loan.due_date<today){loanStatus.textContent="Jatuh tempo tidak boleh sebelum hari ini.";return;}
  try {
    const scope=loanScope();
    await loanOperation("readwrite",store=>store.add({key:`${scope}:${loan.event_id}`,scope,loan}));
    loanStatus.textContent=`Peminjaman "${loan.book_title}" untuk ${loan.student_name} tersimpan di HP.`;
    speaker.speak(`Peminjaman ${loan.book_title} berhasil`);
    loanForm.reset();
    renderLoanStudentPreview(null);
    void syncLoans().then(renderLoans);
    void renderLoans();
  }
  catch {loanStatus.textContent="Gagal menyimpan di perangkat. Periksa ruang penyimpanan dan coba lagi.";}
});
const scanTab=document.getElementById("tab-scan")!,loansTab=document.getElementById("tab-loans")!;
function setLibraryTab(tab:"scan"|"loans") {
  document.getElementById("view-scan")!.hidden=tab!=="scan";
  document.getElementById("view-loans")!.hidden=tab!=="loans";
  scanTab.toggleAttribute("aria-current",tab==="scan");
  loansTab.toggleAttribute("aria-current",tab==="loans");
  if(tab==="loans"){
    if (isScanning) void stopCameraScanner();
    const libLoanSchool = document.querySelector("#library-loan-school");
    if (libLoanSchool && portal.context) libLoanSchool.textContent = portal.context.school_name;
    const loanDue = document.getElementById("loan-due") as HTMLInputElement | null;
    if (loanDue && !loanDue.value) {
      const nextWeek = new Date(Date.now() + 7 * 86400000);
      loanDue.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nextWeek);
    }
    void renderLoans();
    if (!selectedLoanStudent && lastScannedStudent) {
      selectLoanStudent(lastScannedStudent);
    }
  } else {
    if (isLoanScanning) void stopLoanCameraScanner();
  }
}
scanTab.addEventListener("click",()=>setLibraryTab("scan"));loansTab.addEventListener("click",()=>setLibraryTab("loans"));
window.addEventListener("online",()=>{void syncLoans().then(renderLoans);});
window.setInterval(()=>{void syncLoans();},8500);

startRosterRefresh(portal, studentCache);
