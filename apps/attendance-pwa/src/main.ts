import { QRCamera, bindLoginCamera } from "../../shared/qr-camera";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt } from "../../shared/install-prompt";
import "./style.css";
import "../../shared/scanner.css";

// Multi-Scanner Guru Piket & Satpam Session
const portal = new PortalSession("GATE_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Piket Kehadiran", import.meta.env.BASE_URL, import.meta.env.PROD);

// Types
type Direction = "CHECK_IN" | "CHECK_OUT";

type AttendanceRules = {
  check_in_start: string;
  check_in_end: string;
  check_out_start: string;
  timezone: string;
};

type ScanRecord = {
  id: string;
  student_identifier: string;
  student_name?: string;
  class_name?: string;
  direction: Direction;
  occurred_at_local: string;
  occurred_at_utc: string;
  is_late: boolean;
  is_early_departure: boolean;
  notes?: string | null;
  scanner_name?: string | null;
  synced: boolean;
};

type PendingReasonScan = {
  identifier: string;
  direction: Direction;
  occurred_at_local: string;
  occurred_at_utc: string;
  is_late: boolean;
  is_early_departure: boolean;
  student_name?: string;
  class_name?: string;
};

// Storage keys
const STORAGE_KEY_QUEUE = "aksis_attendance_queue_v1";
const STORAGE_KEY_HISTORY = "aksis_attendance_history_v1";
const STORAGE_KEY_RULES = "aksis_attendance_rules_v1";
const STORAGE_KEY_SCANNER_NAME = "aksis_scanner_name_v1";

// State
let currentDirection: Direction = "CHECK_IN";
let rules: AttendanceRules = {
  check_in_start: "06:30",
  check_in_end: "07:30",
  check_out_start: "14:00",
  timezone: "Asia/Makassar"
};
let isScanning = false;
let currentZoom = 1;
let pendingScanForReason: PendingReasonScan | null = null;
let syncInProgress = false;

// Quick chips lists
const LATE_CHIPS = ["Ban Bocor", "Macet Lalu Lintas", "Bangun Kesiangan", "Hujan Lebat", "Urusan Keluarga", "Kendaraan Mogok"];
const EARLY_CHIPS = ["Sakit (Pulang Cepat)", "Izin Acara Keluarga", "Dispensasi Lomba / Tugas", "Keperluan Mendesak", "Jadwal Pulang Khusus"];

// Elements
const views = {
  login: document.getElementById("view-login")!,
  scan: document.getElementById("view-scan")!,
  error: document.getElementById("view-error")!
};

const networkBadge = document.getElementById("network-badge")!;
const queueBadge = document.getElementById("queue-badge")!;
const schoolNameEl = document.getElementById("school-name")!;
const scannerNameDisplay = document.getElementById("scanner-name-display")!;
const btnDirIn = document.getElementById("btn-dir-in") as HTMLButtonElement;
const btnDirOut = document.getElementById("btn-dir-out") as HTMLButtonElement;
const hintDirIn = document.getElementById("hint-dir-in")!;
const hintDirOut = document.getElementById("hint-dir-out")!;
const feedbackBanner = document.getElementById("scan-feedback-banner")!;
const feedbackIcon = document.getElementById("feedback-icon")!;
const feedbackTitle = document.getElementById("feedback-title")!;
const feedbackMessage = document.getElementById("feedback-message")!;
const localScanList = document.getElementById("local-scan-list")!;
const scanCountBadge = document.getElementById("scan-count-badge")!;

// Reason Modal Elements
const modalReason = document.getElementById("modal-reason")!;
const reasonBadgeIcon = document.getElementById("reason-badge-icon")!;
const reasonModalTitle = document.getElementById("reason-modal-title")!;
const reasonModalDesc = document.getElementById("reason-modal-desc")!;
const reasonStudentName = document.getElementById("reason-student-name")!;
const reasonStudentClass = document.getElementById("reason-student-class")!;
const quickChipsContainer = document.getElementById("quick-chips-container")!;
const formReason = document.getElementById("form-reason") as HTMLFormElement;
const reasonInputText = document.getElementById("reason-input-text") as HTMLInputElement;
const btnSkipReason = document.getElementById("btn-skip-reason") as HTMLButtonElement;

// Scanner Name Modal Elements
const modalScannerName = document.getElementById("modal-scanner-name")!;
const formScannerName = document.getElementById("form-scanner-name") as HTMLFormElement;
const inputScannerName = document.getElementById("input-scanner-name") as HTMLInputElement;
const btnEditScannerName = document.getElementById("btn-edit-scanner-name")!;
const btnCloseScannerName = document.getElementById("btn-close-scanner-name")!;

// Camera controls
const btnToggleCamera = document.getElementById("btn-toggle-camera") as HTMLButtonElement;
const btnSwitchCamera = document.getElementById("btn-switch-camera") as HTMLButtonElement;
const zoomControls = document.getElementById("zoom-controls")!;
const formScan = document.getElementById("form-scan") as HTMLFormElement;
const scanInput = document.getElementById("scan-input") as HTMLInputElement;

// Setup login scanner camera
bindLoginCamera(import.meta.env.BASE_URL);

// Camera Setup
const camera = new QRCamera({
  readerId: "qr-reader",
  toggleId: "btn-toggle-camera",
  stageId: "scanner-stage",
  placeholderId: "scanner-placeholder",
  statusId: "scan-status",
  zoomId: "zoom-controls",
  onDecode: async (decodedText) => {
    await handleScannedCode(decodedText.trim());
  },
  onState: (phase) => {
    isScanning = phase === "active";
    if (phase === "active") {
      zoomControls.style.display = "flex";
    } else {
      zoomControls.style.display = "none";
    }
  }
});

btnToggleCamera?.addEventListener("click", async () => {
  if (camera.active) {
    await camera.stop();
  } else {
    await camera.start();
  }
});

btnSwitchCamera?.addEventListener("click", async () => {
  await camera.flip();
});

// Zoom button clicks
document.querySelectorAll<HTMLButtonElement>(".zoom-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".zoom-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const zoomVal = Number(btn.dataset.zoom ?? "1");
    currentZoom = zoomVal;
    await camera.setZoom(zoomVal);
  });
});

// Audio feedback (beep) using Web Audio API
function playBeep(type: "success" | "warning" | "error" | "duplicate") {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "warning") {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1); // A4
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === "duplicate") {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // AudioContext not allowed or not supported, ignore silently
  }
}

// Local Scanner Name handling
function getScannerName(): string {
  return localStorage.getItem(STORAGE_KEY_SCANNER_NAME) || "Guru Piket";
}

function setScannerName(name: string) {
  const clean = name.trim() || "Guru Piket";
  localStorage.setItem(STORAGE_KEY_SCANNER_NAME, clean);
  scannerNameDisplay.textContent = clean;
}

btnEditScannerName?.addEventListener("click", () => {
  inputScannerName.value = getScannerName();
  modalScannerName.style.display = "flex";
  inputScannerName.focus();
});

btnCloseScannerName?.addEventListener("click", () => {
  modalScannerName.style.display = "none";
});

formScannerName?.addEventListener("submit", (e) => {
  e.preventDefault();
  setScannerName(inputScannerName.value);
  modalScannerName.style.display = "none";
});

// Load rules & evaluate automatic direction
function updateDirectionUI() {
  if (currentDirection === "CHECK_IN") {
    btnDirIn.classList.add("active");
    btnDirOut.classList.remove("active");
  } else {
    btnDirOut.classList.add("active");
    btnDirIn.classList.remove("active");
  }
}

function autoDetermineDirection() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeNum = hours * 60 + minutes;

  // Split check_out_start into minutes
  const [outH, outM] = rules.check_out_start.split(":").map(Number);
  const outStartNum = (outH ?? 14) * 60 + (outM ?? 0);

  // If before afternoon checkout hour, default to CHECK_IN, otherwise CHECK_OUT
  if (timeNum < outStartNum) {
    currentDirection = "CHECK_IN";
  } else {
    currentDirection = "CHECK_OUT";
  }
  updateDirectionUI();
}

btnDirIn?.addEventListener("click", () => {
  currentDirection = "CHECK_IN";
  updateDirectionUI();
});

btnDirOut?.addEventListener("click", () => {
  currentDirection = "CHECK_OUT";
  updateDirectionUI();
});

// Update Rules Display
function renderRulesDisplay() {
  hintDirIn.textContent = `Batas: ${rules.check_in_end}`;
  hintDirOut.textContent = `Mulai: ${rules.check_out_start}`;
}

// Queue & History Storage Helpers
function getQueue(): ScanRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUE) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue: ScanRecord[]) {
  localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
  updateQueueBadge();
}

function getHistory(): ScanRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history: ScanRecord[]) {
  // Keep only today's scans in local history (limit 200 items)
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 200)));
  renderHistoryUI();
}

function updateQueueBadge() {
  const queue = getQueue();
  if (queue.length > 0) {
    queueBadge.style.display = "inline-block";
    queueBadge.textContent = `${queue.length} antre`;
  } else {
    queueBadge.style.display = "none";
  }
}

function renderHistoryUI() {
  const history = getHistory();
  scanCountBadge.textContent = `${history.length} siswa`;

  if (history.length === 0) {
    localScanList.innerHTML = `<li class="empty-history">Belum ada pemindaian sesi ini.</li>`;
    return;
  }

  localScanList.innerHTML = history.map(item => {
    let tagHtml = "";
    if (item.direction === "CHECK_IN") {
      tagHtml = item.is_late
        ? `<span class="history-tag late">Terlambat</span>`
        : `<span class="history-tag on-time">Tepat Waktu</span>`;
    } else {
      tagHtml = item.is_early_departure
        ? `<span class="history-tag early">Pulang Cepat</span>`
        : `<span class="history-tag on-time">Pulang</span>`;
    }

    const noteHtml = item.notes ? `<small style="color:#d97706;display:block;margin-top:2px;">"${escapeHtml(item.notes)}"</small>` : "";

    return `
      <li class="history-item">
        <div class="history-item-left">
          <span class="history-name">${escapeHtml(item.student_name || item.student_identifier)}</span>
          <span class="history-sub">${escapeHtml(item.class_name || "Siswa")} · ${item.direction === "CHECK_IN" ? "Masuk" : "Pulang"}${noteHtml}</span>
        </div>
        <div class="history-item-right">
          <span class="history-time">${formatTimeStr(item.occurred_at_local)}</span>
          ${tagHtml}
        </div>
      </li>
    `;
  }).join("");
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>'"]/g, tag => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}

function formatTimeStr(isoOrTime: string): string {
  try {
    if (isoOrTime.includes("T")) {
      const d = new Date(isoOrTime);
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    }
    return isoOrTime;
  } catch {
    return isoOrTime;
  }
}

// Show temporary feedback banner
let feedbackTimer: number | undefined;
function showFeedback(type: "success" | "warning" | "duplicate" | "error", title: string, message: string) {
  if (feedbackTimer) clearTimeout(feedbackTimer);

  feedbackBanner.className = `scan-feedback-banner ${type}`;
  feedbackIcon.textContent = type === "success" ? "✓" : (type === "warning" ? "!" : (type === "duplicate" ? "ℹ" : "✕"));
  feedbackTitle.textContent = title;
  feedbackMessage.textContent = message;
  feedbackBanner.style.display = "flex";

  feedbackTimer = window.setTimeout(() => {
    feedbackBanner.style.display = "none";
  }, 4000);
}

// Check local duplicate scan (same student + direction today)
function checkLocalDuplicate(identifier: string, direction: Direction): ScanRecord | null {
  const todayStr = new Date().toISOString().split("T")[0]!;
  const history = getHistory();
  return history.find(h => {
    const isToday = h.occurred_at_local.startsWith(todayStr) || h.occurred_at_utc.startsWith(todayStr);
    return isToday && h.student_identifier === identifier && h.direction === direction;
  }) || null;
}

// Evaluate time compliance for Late / Early Departure
function evaluateCompliance(direction: Direction, dateObj: Date): { is_late: boolean; is_early_departure: boolean } {
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const mins = String(dateObj.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${mins}`;

  if (direction === "CHECK_IN") {
    const isLate = timeStr > rules.check_in_end;
    return { is_late: isLate, is_early_departure: false };
  } else {
    const isEarly = timeStr < rules.check_out_start;
    return { is_late: false, is_early_departure: isEarly };
  }
}

// Prompt for reason modal dialog
function openReasonModal(pending: PendingReasonScan) {
  pendingScanForReason = pending;

  const isLate = pending.is_late;
  reasonBadgeIcon.textContent = isLate ? "⏰" : "🚪";
  reasonModalTitle.textContent = isLate ? "Siswa Terlambat" : "Pulang Lebih Cepat";
  reasonModalDesc.textContent = isLate
    ? `Siswa datang setelah batas waktu ${rules.check_in_end}. Keterangan akan tersimpan di sistem & portal orang tua:`
    : `Siswa pulang sebelum jam kepulangan resmi ${rules.check_out_start}. Pilih alasan kepulangan lebih cepat:`;

  reasonStudentName.textContent = pending.student_name || pending.identifier;
  reasonStudentClass.textContent = pending.class_name || (pending.direction === "CHECK_IN" ? "Masuk Terlambat" : "Pulang Cepat");

  // Populate quick chips
  const chips = isLate ? LATE_CHIPS : EARLY_CHIPS;
  quickChipsContainer.innerHTML = chips.map(chip => `
    <button type="button" class="chip-btn" data-chip="${escapeHtml(chip)}">${escapeHtml(chip)}</button>
  `).join("");

  reasonInputText.value = "";
  modalReason.style.display = "flex";

  // Chip click listeners
  quickChipsContainer.querySelectorAll<HTMLButtonElement>(".chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      quickChipsContainer.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      reasonInputText.value = btn.dataset.chip || "";
      reasonInputText.focus();
    });
  });

  playBeep("warning");
}

function closeReasonModal() {
  modalReason.style.display = "none";
  pendingScanForReason = null;
}

formReason?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!pendingScanForReason) return;
  const notes = reasonInputText.value.trim() || null;
  finalizeScan(pendingScanForReason, notes);
  closeReasonModal();
});

btnSkipReason?.addEventListener("click", () => {
  if (!pendingScanForReason) return;
  finalizeScan(pendingScanForReason, null);
  closeReasonModal();
});

// Main Scan Processing Engine
async function handleScannedCode(rawCode: string) {
  if (!rawCode) return;

  const now = new Date();
  const occurred_at_utc = now.toISOString();
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");
  const secs = String(now.getSeconds()).padStart(2, "0");
  const todayStr = occurred_at_utc.split("T")[0]!;
  const occurred_at_local = `${todayStr}T${hours}:${mins}:${secs}`;

  // 1. Anti-Duplication Check: check if already scanned today on this device
  const existingLocal = checkLocalDuplicate(rawCode, currentDirection);
  if (existingLocal) {
    const timeFormatted = formatTimeStr(existingLocal.occurred_at_local);
    const dirLabel = currentDirection === "CHECK_IN" ? "masuk" : "pulang";
    playBeep("duplicate");
    showFeedback(
      "duplicate",
      "Kehadiran Sudah Tercatat",
      `Siswa (${existingLocal.student_name || rawCode}) sudah tercatat ${dirLabel} hari ini pukul ${timeFormatted}.`
    );
    return;
  }

  // 2. Evaluate time rules (Late or Early)
  const { is_late, is_early_departure } = evaluateCompliance(currentDirection, now);

  const pending: PendingReasonScan = {
    identifier: rawCode,
    direction: currentDirection,
    occurred_at_local,
    occurred_at_utc,
    is_late,
    is_early_departure
  };

  // 3. If Late or Early departure, popup reason dialog with quick chips
  if (is_late || is_early_departure) {
    openReasonModal(pending);
  } else {
    // On-time scan, finalize immediately
    finalizeScan(pending, null);
  }
}

// Finalize scan record: save to queue & history, trigger background sync
function finalizeScan(scan: PendingReasonScan, notes: string | null) {
  const record: ScanRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    student_identifier: scan.identifier,
    student_name: scan.student_name,
    class_name: scan.class_name,
    direction: scan.direction,
    occurred_at_local: scan.occurred_at_local,
    occurred_at_utc: scan.occurred_at_utc,
    is_late: scan.is_late,
    is_early_departure: scan.is_early_departure,
    notes,
    scanner_name: getScannerName(),
    synced: false
  };

  // Add to local history
  const history = getHistory();
  history.unshift(record);
  saveHistory(history);

  // Add to offline sync queue
  const queue = getQueue();
  queue.push(record);
  saveQueue(queue);

  // Audio & visual feedback
  if (scan.is_late) {
    playBeep("warning");
    showFeedback("warning", "Siswa Terlambat Dicatat", `Dicatat terlambat: ${notes || "Tanpa keterangan"}`);
  } else if (scan.is_early_departure) {
    playBeep("warning");
    showFeedback("warning", "Pulang Lebih Cepat Dicatat", `Dicatat pulang cepat: ${notes || "Tanpa keterangan"}`);
  } else {
    playBeep("success");
    const dirLabel = scan.direction === "CHECK_IN" ? "Kehadiran Datang" : "Kepulangan";
    showFeedback("success", `${dirLabel} Berhasil`, "Data presensi tersimpan cepat di HP.");
  }

  // Trigger silent background sync without blocking UI
  triggerSilentSync();
}

// Silent Background Synchronization Engine
async function triggerSilentSync() {
  if (syncInProgress || !navigator.onLine) return;
  const queue = getQueue();
  if (queue.length === 0) return;

  syncInProgress = true;
  try {
    const payload = {
      scans: queue.map(q => ({
        student_identifier: q.student_identifier,
        direction: q.direction,
        occurred_at_local: q.occurred_at_local,
        occurred_at_utc: q.occurred_at_utc,
        is_late: q.is_late,
        is_early_departure: q.is_early_departure,
        notes: q.notes,
        scanner_name: q.scanner_name
      }))
    };

    const res = await portal.request<{
      accepted_count: number;
      duplicate_count: number;
      records: Array<{
        student_id: string;
        student_name: string;
        direction: string;
        status: string;
        notes: string | null;
      }>;
    }>("/attendance/pwa-sync", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    // Update student names in history if available from server response
    if (res?.records) {
      const history = getHistory();
      for (const rec of res.records) {
        const match = history.find(h => h.student_identifier === rec.student_id || h.student_identifier === rec.student_name);
        if (match && !match.student_name) {
          match.student_name = rec.student_name;
        }
      }
      saveHistory(history);
    }

    // Queue successfully synced, clear it
    saveQueue([]);
  } catch (err) {
    // Sync failed (offline or network fluctuation), keep queue intact to retry next time
    console.warn("Silent attendance sync postponed:", err);
  } finally {
    syncInProgress = false;
    updateQueueBadge();
  }
}

// Fetch active school rules
async function fetchRules() {
  try {
    const res = await portal.request<AttendanceRules>("/attendance/rules");
    if (res) {
      rules = res;
      localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
      renderRulesDisplay();
    }
  } catch {
    const cached = localStorage.getItem(STORAGE_KEY_RULES);
    if (cached) {
      try { rules = JSON.parse(cached); } catch { /* ignore */ }
    }
    renderRulesDisplay();
  }
}

// Manual Form Submit
formScan?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const val = scanInput.value.trim();
  if (!val) return;
  scanInput.value = "";
  await handleScannedCode(val);
});

// Network status listeners
window.addEventListener("online", () => {
  networkBadge.className = "badge-status online";
  networkBadge.textContent = "● Online";
  triggerSilentSync();
});

window.addEventListener("offline", () => {
  networkBadge.className = "badge-status offline";
  networkBadge.textContent = "○ Offline";
});

// Periodic silent sync check every 15 seconds
setInterval(() => {
  if (navigator.onLine && getQueue().length > 0) {
    triggerSilentSync();
  }
}, 15000);

// App Lifecycle Init
async function initApp() {
  // Initial network badge
  if (!navigator.onLine) {
    networkBadge.className = "badge-status offline";
    networkBadge.textContent = "○ Offline";
  }

  // Restore scanner name
  scannerNameDisplay.textContent = getScannerName();

  // Restore cached rules & history
  const cachedRules = localStorage.getItem(STORAGE_KEY_RULES);
  if (cachedRules) {
    try { rules = JSON.parse(cachedRules); } catch { /* ignore */ }
  }
  renderRulesDisplay();
  autoDetermineDirection();
  renderHistoryUI();
  updateQueueBadge();

  try {
    const connected = await portal.start();
    if (!connected) {
      views.login.style.display = "block";
      views.scan.style.display = "none";
      return;
    }

    views.login.style.display = "none";
    views.scan.style.display = "block";

    const nav = document.getElementById("workspace-nav");
    if (nav) nav.hidden = false;

    if (portal.context?.school_name) {
      schoolNameEl.textContent = portal.context.school_name;
    }

    // Load server rules & sync any pending offline scans
    await fetchRules();
    await triggerSilentSync();
  } catch (error) {
    const pErr = error as PortalError;
    if (pErr.code === "PORTAL_MISMATCH" || pErr.status === 403) {
      views.error.hidden = false;
      views.login.style.display = "none";
      views.scan.style.display = "none";
    } else {
      views.login.style.display = "block";
      views.scan.style.display = "none";
    }
  }
}

initApp();
