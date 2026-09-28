import { gateIntro, gateHelp, schoolLabel } from "../../shared/portal-ui";

import { PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
import { Html5Qrcode } from "html5-qrcode";

const portal = new PortalSession("TEACHER", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Ekstrakurikuler", import.meta.env.BASE_URL, import.meta.env.PROD);

const entry = document.getElementById("view-login")!;
entry.classList.add('portal-gate');
const accessForm = document.getElementById('form-login')!;
entry.innerHTML = gateIntro('Kegiatan & presensi', 'Kelola kehadiran kegiatan siswa melalui akses yang diberikan Admin Sekolah.');
entry.append(accessForm); entry.insertAdjacentHTML('beforeend', gateHelp);
const views = {
  login: document.getElementById("view-login")!,
  dashboard: document.getElementById("view-dashboard")!,
  scan: document.getElementById("view-scan")!
};

let currentEkskulId = "";
let currentSessionId = "";
let pendingStudentId = "";

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
    document.getElementById("btn-toggle-camera")!.innerHTML = "Tutup Kamera";
  } catch (err: any) {
    document.getElementById("scan-error")!.textContent = !window.isSecureContext
      ? "Kamera diblokir browser karena diakses via HTTP (bukan localhost/HTTPS)."
      : "Kamera tidak dapat diakses (izin ditolak atau tidak ditemukan).";
    document.getElementById("qr-reader")!.style.display = "none";
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
  if (viewName === "scan") setTimeout(() => document.getElementById("scan-input")?.focus(), 100);
}

const request = <T>(path: string, init: RequestInit = {}) => portal.request<T>(path, init);
async function init() {
  switchView("login");
  try {
    if (!await portal.start()) {
      document.getElementById("login-error")!.textContent = "Pindai QR Ekstrakurikuler dari admin sekolah untuk masuk.";
      return;
    }
    schoolLabel(portal.context!.school_name);
    await loadDashboard();
  } catch (error) {
    switchView("login");
    document.getElementById("login-error")!.textContent = error instanceof Error ? error.message : "Belum dapat terhubung.";
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

    // Auto-select if URL parameter exists
    const urlParams = new URLSearchParams(window.location.search);
    const ekskulParam = urlParams.get("ekskulId");
    if (ekskulParam) {
      const match = activities.find(a => a.id === ekskulParam);
      if (match) selectEkskul(match.id, match.name);
    }
  } catch (err: any) { container.textContent = err.message; throw err; }
}

async function selectEkskul(id: string, name: string) {
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
    theme_color: "#102f43",
    background_color: "#f2f6f8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
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
    let todaySession = sessions.find(s => new Date(s.starts_at).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) === todayStr);

    if (!todaySession) {
      // Create if it doesn't exist
      todaySession = await request<any>(`/extracurriculars/${id}/sessions`, {
        method: "POST", body: JSON.stringify({
          name: `Sesi ${new Date().toLocaleDateString("id-ID")}`, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 7200000).toISOString()
        })
      });
    }

    currentSessionId = todaySession.id;
    document.getElementById("enrollment-prompt")!.style.display = "none";
    document.getElementById("success-prompt")!.style.display = "none";
    switchView("scan");
  } catch (err: any) {
    alert("Gagal memuat atau membuat sesi: " + err.message);
    switchView("dashboard");
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
  }
  switchView(target);
}));

// 5. SCANNER & ENROLLMENT
document.getElementById("form-scan")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("scan-input") as HTMLInputElement;
  const errorEl = document.getElementById("scan-error")!;
  const query = input.value.trim();
  if (!query) return;

  errorEl.textContent = "Mencari siswa...";
  document.getElementById("enrollment-prompt")!.style.display = "none";
  document.getElementById("success-prompt")!.style.display = "none";

  try {
    const students = /^[a-f0-9]{48}$/.test(query)
      ? [await request<{id:string;full_name:string}>("/cards/resolve", {method:"POST",body:JSON.stringify({qr_key:query})})]
      : await request<Array<{id:string;full_name:string}>>(`/students?search=${encodeURIComponent(query)}`);
    if (students.length !== 1) throw new Error(students.length ? "Masukkan NIS/NISN lengkap agar siswa tidak tertukar." : "Siswa tidak ditemukan.");
    const student = students[0]!;
    pendingStudentId = student.id;
    input.value = "";
    errorEl.textContent = "";

    // Record attendance directly
    try {
      await request(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/attendance`, {
        method: "POST", body: JSON.stringify({
          student_id: student.id, status: "PRESENT"
        })
      });
      // Success
      document.getElementById("success-student-name")!.textContent = `${student.full_name} - Hadir`;
      document.getElementById("success-prompt")!.style.display = "block";
    } catch (err: any) {
      // If error is FK violation or related to membership, trigger Fast Enrollment
      if (err.message?.includes("foreign key") || err.message?.includes("member")) {
        document.getElementById("unregistered-student-name")!.textContent = student.full_name;
        document.getElementById("enrollment-prompt")!.style.display = "block";
      } else {
        throw err;
      }
    }
  } catch (err: any) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("btn-cancel-enroll")!.addEventListener("click", () => {
  document.getElementById("enrollment-prompt")!.style.display = "none";
  document.getElementById("scan-input")?.focus();
});

document.getElementById("btn-confirm-enroll")!.addEventListener("click", async () => {
  const errorEl = document.getElementById("scan-error")!;
  try {
    document.getElementById("enrollment-prompt")!.style.display = "none";
    errorEl.textContent = "Mendaftarkan siswa...";

    // Fast Enroll
    await request(`/extracurriculars/${currentEkskulId}/members/fast-enroll`, {
      method: "POST", body: JSON.stringify({
        student_id: pendingStudentId, idempotency_key: crypto.randomUUID(), confirmed: true
      })
    });

    // Then Attendance
    errorEl.textContent = "Mencatat presensi...";
    await request(`/extracurriculars/${currentEkskulId}/sessions/${currentSessionId}/attendance`, {
      method: "POST", body: JSON.stringify({
        student_id: pendingStudentId, status: "PRESENT"
      })
    });

    errorEl.textContent = "";
    document.getElementById("success-student-name")!.textContent = `Siswa Berhasil Didaftarkan & Hadir`;
    document.getElementById("success-prompt")!.style.display = "block";

  } catch (err: any) {
    errorEl.textContent = "Gagal: " + err.message;
  }
});

void init();

const logout = document.createElement('button'); logout.textContent = 'Keluar'; logout.hidden = true;
document.querySelector('header')!.append(logout);
new MutationObserver(() => { logout.hidden = views.login.style.display !== 'none'; }).observe(views.login, {attributes:true,attributeFilter:['style']});
logout.onclick = async () => { await stopCameraScanner(); await portal.logout().catch(() => undefined); location.replace(location.pathname); };
