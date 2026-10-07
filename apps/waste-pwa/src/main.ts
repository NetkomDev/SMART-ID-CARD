import { gateIntro, gateHelp, escapePortal as esc } from "../../shared/portal-ui";
import "./style.css";
import { PortalError, PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
import { calculateWasteMeasurement, type WasteType, type WasteUnit } from "./waste-calculation.js";

const portal = new PortalSession("WASTE_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Piket Bank Sampah", import.meta.env.BASE_URL, import.meta.env.PROD);
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = <T extends HTMLInputElement | HTMLSelectElement = HTMLInputElement>(id: string) => el<T>(id);
const number = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
const message = (error: unknown) => error instanceof Error ? error.message : "Layanan belum dapat dihubungi. Coba kembali.";
const login = el("view-login");
const loginForm = el<HTMLFormElement>("form-login");
login.classList.add("portal-gate");
login.innerHTML = gateIntro("Piket Bank Sampah", "Catat setoran dan lihat kontribusi sekolah melalui akses resmi dari admin.");
login.append(loginForm); login.insertAdjacentHTML("beforeend", gateHelp);

let loginScanner: any = null;
el("btn-start-login-scan").addEventListener("click", async () => {
  el("btn-start-login-scan").style.display = "none";
  el("btn-login-retry").style.display = "none";
  el("login-scanner-container").style.display = "block";
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
    el("login-error").textContent = "Kamera tidak dapat diakses untuk memindai QR.";
    el("login-scanner-container").style.display = "none";
    el("btn-start-login-scan").style.display = "block";
  }
});
el("btn-cancel-login-scan").addEventListener("click", async () => {
  if (loginScanner) { try { await loginScanner.stop(); } catch {} }
  el("login-scanner-container").style.display = "none";
  el("btn-start-login-scan").style.display = "block";
});
el("form-login").addEventListener("submit", (e) => { e.preventDefault(); void init(); });

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
let scanning = false, cameraBusy = false, cameraStart: Promise<void> | null = null, facing: "environment" | "user" = "environment";
let scanner: any = null, resolving = false, saving = false;
type PendingDeposit = { event_id: string; class_id: string; student_id: string; organic_kg: number; inorganic_kg: number; source: string };
let pending: PendingDeposit | null = null;
const pendingKey = () => `aksis.waste.pending.${portal.context?.id ?? ""}`;
function rememberPending() {
  try {
    if (pending && student) sessionStorage.setItem(pendingKey(), JSON.stringify({ pending, student }));
    else sessionStorage.removeItem(pendingKey());
  } catch { /* In-memory retry still protects this session when storage is disabled. */ }
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
}

function triggerCameraFlash() {
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

function hideNotFoundModal() {
  const modal = el("modal-not-found");
  if (modal) modal.style.display = "none";
}

function showLoadingOverlay(show: boolean) {
  const overlay = el("loading-overlay");
  if (overlay) overlay.style.display = show ? "flex" : "none";
}

async function stopCamera() {
  if (scanning && scanner) { try { await scanner.stop(); } catch { /* Already stopped by browser. */ } }
  scanning = false;
  el("qr-reader").style.display = "none";
  el("scanner-placeholder").hidden = false;
  el("btn-toggle-camera").textContent = "Buka Kamera Scanner";
}
async function startCamera() {
  if (cameraBusy || scanning) return;
  cameraBusy = true;
  el<HTMLButtonElement>("btn-toggle-camera").disabled = true;
  cameraStart = (async () => {
    try {
      if (!scanner) {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode("qr-reader");
      }
      el("scan-error").style.display = "none";
      el("scan-error").textContent = "";
      el("qr-reader").style.display = "block";
      el("scanner-placeholder").hidden = true;
      await scanner.start({ facingMode: facing }, { fps: 10, qrbox: (w: number, h: number) => ({ width: Math.min(220, w * .7, h * .7), height: Math.min(220, w * .7, h * .7) }) }, (decoded: string) => {
        if (resolving || view === "input") return;
        triggerCameraFlash();
        void stopCamera();
        void resolveStudent(decoded);
      }, () => undefined);
      scanning = true;
      el("btn-toggle-camera").textContent = "Tutup Kamera";
    } catch {
      el("scan-error").style.display = "block";
      el("scan-error").textContent = "Kamera tidak tersedia. Izinkan akses kamera atau masukkan nomor siswa.";
      el("qr-reader").style.display = "none";
      el("scanner-placeholder").hidden = false;
    } finally { cameraBusy = false; el<HTMLButtonElement>("btn-toggle-camera").disabled = false; }
  })();
  await cameraStart; cameraStart = null;
}
function switchView(next: View) {
  view = next;
  hideNotFoundModal();
  showLoadingOverlay(false);
  if (next !== "scan" && next !== "input") void stopCamera();
  for (const name of ["login", "scan", "input", "success", "ranking"] as View[]) {
    const section = el(`view-${name}`);
    if (name === next || (next === "input" && name === "scan")) {
      section.style.display = name === "input" ? "flex" : "block";
    } else {
      section.style.display = "none";
    }
  }
  el("workspace-nav").hidden = next === "login";
  el("today-panel").hidden = next !== "ranking";
  el("form-scan").hidden = false;
  el("btn-toggle-camera").hidden = false;
  el("btn-switch-camera").hidden = false;
  el("scanner-hint").textContent = "Kartu kecil, langkah besar untuk bumi yang lebih bersih.";
  el("scan-status").textContent = next === "input" ? "✓ Siswa terdeteksi · siap mencatat setoran" : "Siap memindai identitas siswa";
  document.body.classList.toggle("show-ranking", next === "ranking");
  const subEl = document.getElementById("header-subtitle");
  if (subEl) subEl.textContent = "Piket Sampah";
  if (next === "ranking") window.scrollTo({ top: 0, behavior: "instant" });
  for (const [id, active] of [["btn-ranking", next === "ranking"], ["btn-deposit", next !== "ranking"]] as const) {
    el(id).classList.toggle("active", active);
    if (active) el(id).setAttribute("aria-current", "page"); else el(id).removeAttribute("aria-current");
  }
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
async function loadDashboard() {
  if (!portal.connected || view === "login") return;
  if (portal.context!.id !== activePortalId) { window.location.reload(); return; }
  const schoolId = portal.context!.school_id;
  const requestId = ++dashboardRequest;
  el<HTMLButtonElement>("btn-refresh").disabled = true;
  el("ranking-content").setAttribute("aria-busy", "true");
  try {
    const data = await portal.request<Dashboard>(`/waste/dashboard?period=${input<HTMLSelectElement>("ranking-period").value}`);
    if (requestId !== dashboardRequest || !portal.connected) return;
    if (portal.context?.school_id !== schoolId || data.school_id !== schoolId) {
      dashboard = null;
      el("ranking-content").hidden = true;
      throw new PortalError("Konteks sekolah berubah. Muat ulang halaman sebelum melihat data.", 403, "PORTAL_MISMATCH");
    }
    dashboard = data; renderDashboard(data);
    el("ranking-content").hidden = false;
    el("dashboard-error").textContent = ""; el("ranking-error").textContent = "";
  } catch (error) {
    if (requestId !== dashboardRequest) return;
    clearDailySummary();
    if (error instanceof PortalError && (error.status === 401 || error.status === 403)) {
      switchView("login");
      el("login-error").textContent = message(error);
      el("btn-login-retry").style.display = "block";
      el("btn-start-login-scan").style.display = "block";
      return;
    }
    const text = `Data belum diperbarui. ${message(error)}`;
    el("dashboard-error").textContent = text; el("ranking-error").textContent = text;
    el("ranking-updated").textContent = "Pembaruan gagal · tekan Perbarui untuk mencoba lagi";
    if (!dashboard || dashboard.period !== input<HTMLSelectElement>("ranking-period").value) el("ranking-content").hidden = true;
  } finally {
    if (requestId === dashboardRequest) { el<HTMLButtonElement>("btn-refresh").disabled = false; el("ranking-content").setAttribute("aria-busy", "false"); }
  }
}
async function init() {
  clearDailySummary();
  switchView("login"); el("login-error").textContent = "Membuka akses sekolah…";
  try {
    if (!await portal.start()) {
      el("login-error").textContent = "Pindai QR Akses dari admin sekolah untuk masuk.";
      el("btn-start-login-scan").style.display = "block";
      el("btn-login-retry").style.display = "none";
      return;
    }
    classId = portal.context!.metadata.class_id ?? "";
    activePortalId = portal.context!.id;
    if (!classId) throw new Error("QR belum terhubung ke kelas. Hubungi admin sekolah.");
    const cls = await portal.request<{ name: string }>(`/classes/${classId}`);
    className = cls.name;
    el("class-name-label").textContent = `Kelas ${className.replace(/^(?:kelas\s+)+/i, "").trim()}`;
    el("school-name").textContent = portal.context!.school_name;
    el("today-scope").textContent = `Semua kelas di ${portal.context!.school_name}`;
    el("staff-label").textContent = `Piket ${className}`;
    switchView("scan");
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey()) ?? "null") as { pending: PendingDeposit; student: Student } | null;
      if (saved?.pending.class_id === classId && saved.student.id === saved.pending.student_id) {
        pending = saved.pending; showStudent(saved.student);
        input("weight-input").value = String(pending.organic_kg + pending.inorganic_kg);
        input<HTMLSelectElement>("unit-select").value = "KG";
        document.querySelector<HTMLInputElement>(`input[value="${pending.organic_kg > 0 ? "ORGANIC" : "INORGANIC"}"]`)!.checked = true;
        lockForm(true); switchView("input"); updateMeasurement();
        el("input-error").textContent = "Ada setoran yang belum terkonfirmasi. Tekan Simpan Setoran untuk memeriksa atau mengulang tanpa menggandakan data.";
      }
    } catch { /* Ignore malformed browser storage. */ }
    void loadDashboard(); offerInstall();
  } catch (error) {
    el("login-error").textContent = message(error);
    el("btn-login-retry").style.display = "block";
    el("btn-start-login-scan").style.display = "block";
  }
}
async function resolveStudent(scannedText?: string) {
  const query = (scannedText ?? input("scan-input").value).trim();
  if (!query || resolving || pending) return;

  resolving = true;
  hideNotFoundModal();
  showLoadingOverlay(true);
  el("scan-error").style.display = "none";
  el("scan-error").textContent = "";
  el<HTMLButtonElement>("btn-ranking").disabled = true;

  try {
    let resolvedStudent: Student | null = null;

    // 1. Try card resolve RPC endpoint first (handles hex QR keys, card UIDs, card serials, etc.)
    try {
      const cardRes = await portal.request<Student>("/cards/resolve", {
        method: "POST",
        body: JSON.stringify({ qr_key: query })
      });
      if (cardRes && cardRes.id) {
        resolvedStudent = cardRes;
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback: Search students by NISN / NIS / Name
    if (!resolvedStudent) {
      try {
        const list = await portal.request<Student[]>(`/students?search=${encodeURIComponent(query)}`);
        if (Array.isArray(list) && list.length === 1) {
          resolvedStudent = list[0]!;
        } else if (Array.isArray(list) && list.length > 1) {
          throw new Error("Lebih dari satu siswa cocok. Masukkan NIS / NISN lengkap.");
        }
      } catch (err: any) {
        if (err?.message?.includes("Lebih dari satu")) throw err;
      }
    }

    if (!resolvedStudent) {
      throw new Error("Kartu / siswa tidak ditemukan di sekolah ini.");
    }

    // If scanned via camera, keep manual search input box untouched!
    if (!scannedText) {
      input("scan-input").value = "";
    }

    showStudent(resolvedStudent);
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
  if (!Number.isFinite(measurement.total_kg) || measurement.total_kg <= 0 || measurement.total_kg > 1000) { el("input-error").textContent = "Berat harus lebih dari 0 dan maksimal 1.000 kg."; return; }
  pending ??= { event_id: crypto.randomUUID(), class_id: classId, student_id: student.id, organic_kg: measurement.organic_kg, inorganic_kg: measurement.inorganic_kg, source: measurement.source };
  rememberPending();
  saving = true; lockForm(true); el<HTMLButtonElement>("btn-save").disabled = true;
  el("input-error").textContent = "Menyimpan setoran…";
  try {
    const saved = await portal.request<{ total_kg: number; points_earned: number | null }>("/waste/transactions", { method: "POST", body: JSON.stringify(pending) });
    el("success-detail").textContent = `${student.full_name} · ${number(saved.total_kg)} kg${saved.points_earned == null ? "" : ` · ${number(saved.points_earned)} poin`}. Terima kasih sudah berkontribusi!`;
    pending = null; rememberPending(); student = null; el("input-error").textContent = ""; lockForm(false); switchView("success"); void loadDashboard();
  } catch (error) {
    // Keep the same event and payload after an ambiguous network/server failure.
    if (error instanceof PortalError && error.status >= 400 && error.status < 500 && error.status !== 409) { pending = null; rememberPending(); lockForm(false); }
    el("input-error").textContent = `${message(error)}${pending ? " Tekan Simpan Setoran untuk mengecek atau mengulang setoran yang sama tanpa menggandakan data." : ""}`;
  } finally { saving = false; el<HTMLButtonElement>("btn-save").disabled = false; }
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
el("btn-deposit").addEventListener("click", () => switchView(student && view !== "success" ? "input" : "scan"));
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
window.setInterval(() => { if (!document.hidden && view !== "login") void loadDashboard(); }, 60_000);
document.addEventListener("visibilitychange", () => { if (document.hidden) void stopCamera(); else void loadDashboard(); });
void init();

