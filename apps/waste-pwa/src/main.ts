import { gateIntro, gateHelp, schoolLabel } from "../../shared/portal-ui";
import "./style.css";
import { PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
import { Html5Qrcode } from "html5-qrcode";
const portal = new PortalSession("WASTE_STAFF", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Piket Bank Sampah", import.meta.env.BASE_URL, import.meta.env.PROD);
import { calculateWasteMeasurement, type WasteType, type WasteUnit } from "./waste-calculation.js";

const entry = document.getElementById("view-login")!;
entry.classList.add('portal-gate');
const accessForm = document.getElementById('form-login')!;
entry.innerHTML = gateIntro('Piket Bank Sampah', 'Catat setoran siswa dan aktivitas kebersihan kelas melalui akses resmi sekolah.');
entry.append(accessForm); entry.insertAdjacentHTML('beforeend', gateHelp);
// DOM Elements
const views = {
  error: document.getElementById("view-error")!,
  login: document.getElementById("view-login")!,
  scan: document.getElementById("view-scan")!,
  input: document.getElementById("view-input")!,
  success: document.getElementById("view-success")!
};

const elements = {
  className: document.getElementById("class-name-label")!,
  formLogin: document.getElementById("form-login") as HTMLFormElement,
  loginError: document.getElementById("login-error")!,
  formScan: document.getElementById("form-scan") as HTMLFormElement,
  scanInput: document.getElementById("scan-input") as HTMLInputElement,
  scanError: document.getElementById("scan-error")!,
  btnLogout: document.getElementById("btn-logout")!,

  formInput: document.getElementById("form-input") as HTMLFormElement,
  inputStudentName: document.getElementById("input-student-name")!,
  inputStudentNisn: document.getElementById("input-student-nisn")!,
  weightInput: document.getElementById("weight-input") as HTMLInputElement,
  unitSelect: document.getElementById("unit-select") as HTMLSelectElement,
  wasteTypeSelect: document.getElementById("waste-type") as HTMLSelectElement,
  totalOutput: document.getElementById("total") as HTMLOutputElement,
  inputError: document.getElementById("input-error")!,
  btnCancelInput: document.getElementById("btn-cancel-input")!,

  btnNextScan: document.getElementById("btn-next-scan")!
};

let currentClassId = "";
let currentStudentId = "";

let html5QrCode: Html5Qrcode | null = null;
let isScanning = false;

async function stopCameraScanner() {
  if (html5QrCode && isScanning) {
    try { await html5QrCode.stop(); } catch (e) {}
    isScanning = false;
    document.getElementById("qr-reader")!.style.display = "none";
    document.getElementById("btn-toggle-camera")!.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      Buka Kamera Scanner
    `;
  }
}

async function startCameraScanner() {
  if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
  try {
    document.getElementById("qr-reader")!.style.display = "block";

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    const onScanSuccess = async (decodedText: string) => {
      elements.scanInput.value = decodedText;
      await stopCameraScanner();
      elements.formScan.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    };

    try {
      // Prioritaskan secara paksa (strict) menggunakan kamera belakang
      await html5QrCode.start({ facingMode: { exact: "environment" } }, config, onScanSuccess, () => {});
    } catch (e) {
      // Fallback jika device tidak mengenali constraint "exact: environment"
      await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => {});
    }

    isScanning = true;
    document.getElementById("btn-toggle-camera")!.innerHTML = "Tutup Kamera";
  } catch (err) {
    elements.scanError.textContent = "Kamera tidak dapat diakses atau tidak ditemukan.";
    document.getElementById("qr-reader")!.style.display = "none";
  }
}

document.getElementById("btn-toggle-camera")!.addEventListener("click", () => {
  if (isScanning) stopCameraScanner();
  else startCameraScanner();
});

function switchView(viewName: keyof typeof views) {
  if (viewName !== "scan") stopCameraScanner();
  Object.values(views).forEach(v => v.style.display = "none");
  views[viewName].style.display = "block";
  if (viewName === "scan") setTimeout(() => elements.scanInput.focus(), 100);
}

// QR exchange and saved-session restoration share the same path.
async function init() {
  switchView("login");
  elements.loginError.textContent = "Membuka akses sekolah…";
  try {
    if (!await portal.start()) {
      elements.loginError.textContent = "Pindai QR Piket Bank Sampah dari admin sekolah untuk masuk.";
      return;
    }
    schoolLabel(portal.context!.school_name);
    currentClassId = portal.context?.metadata.class_id ?? "";
    if (!currentClassId) throw new Error("QR belum terhubung ke kelas. Hubungi admin sekolah.");
    const cls = await portal.request<{name:string}>(`/classes/${currentClassId}`);
    elements.className.textContent = cls.name.toUpperCase().startsWith("KELAS ")
      ? cls.name.toUpperCase()
      : `KELAS ${cls.name.toUpperCase()}`;
    switchView("scan"); offerInstall();
  } catch (error) {
    elements.loginError.textContent = error instanceof Error ? error.message : "Belum dapat terhubung.";
  }
}

// 2. LOGIN (Disabled)
elements.formLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  void init();
});

elements.btnLogout.addEventListener("click", async () => {
  await portal.logout().catch(() => undefined);
  currentClassId = "";
  elements.loginError.textContent = "Anda sudah keluar. Pindai QR untuk masuk kembali.";
  switchView("login");
});

// 3. SCAN
elements.formScan.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = elements.scanInput.value.trim();
  if (!query) return;

  elements.scanError.textContent = "Mencari siswa...";
  try {
    const students = /^[a-f0-9]{48}$/.test(query)
      ? [await portal.request<{id:string;full_name:string;nisn?:string|null;student_number:string}>("/cards/resolve", { method: "POST", body: JSON.stringify({qr_key:query}) })]
      : await portal.request<Array<{id:string;full_name:string;nisn:string|null;student_number:string}>>(`/students?search=${encodeURIComponent(query)}`);
    if (students.length !== 1) throw new Error(students.length ? "Lebih dari satu siswa cocok. Masukkan NIS/NISN lengkap." : "Siswa tidak ditemukan di kelas ini.");
    const student = students[0]!;
    currentStudentId = student.id;
    elements.inputStudentName.textContent = student.full_name;
    elements.inputStudentNisn.textContent = `NISN: ${student.nisn || student.student_number}`;
    elements.scanInput.value = "";
    elements.scanError.textContent = "";

    // Reset Form Input
    elements.weightInput.value = "0.500";
    elements.unitSelect.value = "KG";
    updateTotal();
    switchView("input");
  } catch (err: any) {
    elements.scanError.textContent = err.message;
    elements.scanInput.select();
  }
});

// 4. INPUT
function updateTotal() {
  const measurement = calculateWasteMeasurement(
    Number(elements.weightInput.value),
    elements.unitSelect.value as WasteUnit,
    elements.wasteTypeSelect.value as WasteType
  );
  elements.totalOutput.value = `Total ${measurement.total_kg.toFixed(3)} kg`;
  return measurement;
}

elements.formInput.addEventListener("input", updateTotal);

elements.btnCancelInput.addEventListener("click", () => switchView("scan"));

elements.formInput.addEventListener("submit", async (e) => {
  e.preventDefault();
  elements.inputError.textContent = "Menyimpan...";
  const measurement = updateTotal();
  const eventId = crypto.randomUUID(); // Idempotency key

  try {
    await portal.request("/waste/transactions", {
      method: "POST",
      body: JSON.stringify({ event_id: eventId, class_id: currentClassId, student_id: currentStudentId,
        organic_kg: measurement.organic_kg, inorganic_kg: measurement.inorganic_kg, source: measurement.source })
    });
    elements.inputError.textContent = "";
    switchView("success");
  } catch (err: any) {
    elements.inputError.textContent = err.message;
    if (err.message.toLowerCase().includes("jadwal")) {
      alert(err.message);
    }
  }
});

// 5. SUCCESS
elements.btnNextScan.addEventListener("click", () => switchView("scan"));

void init();
