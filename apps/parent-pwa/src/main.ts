import { gateIntro, gateHelp } from "../../shared/portal-ui";
import "./styles.css";
import { PortalSession } from "../../shared/portal-session";
import { setupInstallPrompt, offerInstall } from "../../shared/install-prompt";
import { Html5Qrcode } from "html5-qrcode";

const portal = new PortalSession("PARENT", import.meta.env.VITE_API_BASE_URL ?? "/api/v1");
setupInstallPrompt("Portal Orang Tua", import.meta.env.BASE_URL, import.meta.env.PROD);

type Child = {
  student_id: string;
  school_name: string;
  full_name: string;
  student_number: string;
  class_name?: string | null;
  relationship: string;
};

type ParentTodayData = {
  student_id: string;
  timezone: string;
  as_of?: string;
  profile?: {
    full_name: string;
    first_name: string;
    school_name: string;
    class_name: string;
    photo_url?: string | null;
  };
  attendance?: {
    status: "HADIR" | "TERLAMBAT" | "PULANG" | "BELUM_HADIR";
    check_in: string;
    check_out: string;
  };
  waste?: {
    today_kg: number;
    total_points: number;
    today_points: number;
    unscored?: number;
  };
  library?: {
    today_visits: number;
    month_visits: number;
  };
  extracurricular?: {
    name: string;
    status: "HADIR" | "BELUM_HADIR" | "TIDAK_ADA" | "IZIN" | "ALPA";
    time_attended: string;
    schedule?: string | null;
    activities_count?: number;
  };
  events: Array<{
    id: string;
    type: string;
    occurred_at: string;
    is_late: boolean;
    extra_info?: string;
  }>;
};

const root = document.querySelector<HTMLDivElement>("#app")!;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const request = <T>(path: string, init: RequestInit = {}) => portal.request<T>(path, init);

let loginScanner: Html5Qrcode | null = null;
let selectedChildId = "";
let viewRevision = 0;
let dashboardVisible = false;
const number = (value: number | null) => value == null ? "—" : value.toLocaleString("id-ID", { maximumFractionDigits: 2 });

function openPhotoCropperModal(studentId: string, studentName: string) {
  const modal = document.createElement("div");
  modal.className = "photo-modal-overlay";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
  
  modal.innerHTML = `
    <div style="background:white;border-radius:24px;width:100%;max-width:420px;max-height:92vh;overflow-y:auto;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);font-family:sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:#0f172a;">Foto ID Card PVC 3:4</h3>
        <button id="close-cropper-modal" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;padding:2px 8px;">&times;</button>
      </div>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:0.82rem;color:#1e40af;">
        <strong style="display:block;margin-bottom:4px;color:#1e3a8a;">📌 Panduan Foto Resmi Sekolah:</strong>
        <ul style="margin:0;padding-left:16px;line-height:1.45;">
          <li>Gunakan seragam sekolah resmi & rapi</li>
          <li>Wajah menghadap lurus ke depan</li>
          <li>Latar belakang polos/satu warna</li>
        </ul>
      </div>

      <div style="text-align:center;margin-bottom:16px;">
        <input type="file" id="photo-file-input" accept="image/*" capture="user" style="display:none;" />
        <button type="button" id="btn-select-photo" style="width:100%;padding:12px;border-radius:12px;background:#2563eb;color:white;font-weight:600;font-size:0.92rem;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;">
          📷 Ambil / Pilih Foto ${esc(studentName)}
        </button>
      </div>

      <div id="cropper-container" style="display:none;flex-direction:column;align-items:center;">
        <div style="position:relative;width:240px;height:320px;border:3px dashed #2563eb;border-radius:16px;overflow:hidden;background:#f8fafc;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin-bottom:12px;touch-action:none;cursor:move;">
          <canvas id="cropper-canvas" width="240" height="320" style="width:240px;height:320px;"></canvas>
          <div style="position:absolute;inset:0;border:2px solid rgba(37,99,235,0.4);pointer-events:none;border-radius:14px;"></div>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;width:100%;justify-content:center;">
          <button type="button" id="btn-zoom-out" style="padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:white;font-weight:600;cursor:pointer;">🔍 -</button>
          <span style="font-size:0.82rem;color:#64748b;font-weight:500;">Geser & Zoom Foto</span>
          <button type="button" id="btn-zoom-in" style="padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:white;font-weight:600;cursor:pointer;">🔍 +</button>
        </div>

        <button type="button" id="btn-save-photo" style="width:100%;padding:12px;border-radius:12px;background:#16a34a;color:white;font-weight:600;font-size:0.95rem;border:none;cursor:pointer;">
          💾 Simpan Foto (Rasio 3:4 Pas PVC)
        </button>
      </div>

      <div id="cropper-status" style="margin-top:12px;text-align:center;font-size:0.85rem;"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector("#close-cropper-modal") as HTMLButtonElement;
  const fileInput = modal.querySelector("#photo-file-input") as HTMLInputElement;
  const selectBtn = modal.querySelector("#btn-select-photo") as HTMLButtonElement;
  const cropperContainer = modal.querySelector("#cropper-container") as HTMLDivElement;
  const canvas = modal.querySelector("#cropper-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const zoomInBtn = modal.querySelector("#btn-zoom-in") as HTMLButtonElement;
  const zoomOutBtn = modal.querySelector("#btn-zoom-out") as HTMLButtonElement;
  const saveBtn = modal.querySelector("#btn-save-photo") as HTMLButtonElement;
  const statusDiv = modal.querySelector("#cropper-status") as HTMLDivElement;

  let loadedImg: HTMLImageElement | null = null;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  closeBtn.onclick = () => modal.remove();
  selectBtn.onclick = () => fileInput.click();

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImg = img;
        cropperContainer.style.display = "flex";
        
        const scaleX = 240 / img.width;
        const scaleY = 320 / img.height;
        scale = Math.max(scaleX, scaleY);
        offsetX = (240 - img.width * scale) / 2;
        offsetY = (320 - img.height * scale) / 2;
        draw();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  function draw() {
    if (!loadedImg) return;
    ctx.clearRect(0, 0, 240, 320);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 240, 320);
    ctx.drawImage(loadedImg, offsetX, offsetY, loadedImg.width * scale, loadedImg.height * scale);
  }

  zoomInBtn.onclick = () => { scale *= 1.15; draw(); };
  zoomOutBtn.onclick = () => { scale /= 1.15; draw(); };

  canvas.onpointerdown = (e) => {
    isDragging = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  };

  canvas.onpointermove = (e) => {
    if (!isDragging) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    draw();
  };

  canvas.onpointerup = canvas.onpointercancel = (e) => {
    isDragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  };

  saveBtn.onclick = async () => {
    if (!loadedImg) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan foto...";
    statusDiv.style.color = "#2563eb";
    statusDiv.textContent = "Memproses & mengunggah foto...";

    try {
      const outCanvas = document.createElement("canvas");
      outCanvas.width = 600;
      outCanvas.height = 800;
      const outCtx = outCanvas.getContext("2d")!;
      
      const ratio = 600 / 240;
      outCtx.fillStyle = "#ffffff";
      outCtx.fillRect(0, 0, 600, 800);
      outCtx.drawImage(loadedImg, offsetX * ratio, offsetY * ratio, loadedImg.width * scale * ratio, loadedImg.height * scale * ratio);

      const base64Photo = outCanvas.toDataURL("image/jpeg", 0.88);

      await request(`/parent/children/${studentId}/photo`, {
        method: "POST",
        body: JSON.stringify({ photo_url: base64Photo })
      });

      statusDiv.style.color = "#16a34a";
      statusDiv.textContent = "✅ Foto berhasil disimpan! Status kartu otomatis SIAP CETAK.";
      setTimeout(() => {
        modal.remove();
        void dashboard();
      }, 1000);
    } catch (err: any) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Coba Lagi";
      statusDiv.style.color = "#dc2626";
      statusDiv.textContent = "❌ Gagal menyimpan foto: " + (err.message || "Terjadi kesalahan");
    }
  };
}

function loginView(message = "Pindai QR dari admin sekolah untuk membuka aktivitas anak Anda.", isError = false) {
  viewRevision++;
  dashboardVisible = false;
  root.innerHTML = `
    <main class="login">
      <header>
        <div class="brand">
          <img src="${import.meta.env.BASE_URL}logo.png" alt="AKSIS Logo">
          <b>AKSIS · Keluarga</b>
        </div>
      </header>
      <section class="portal-gate">
        ${gateIntro('Dekat dengan hari anak Anda', 'Ikuti kehadiran dan aktivitas anak melalui informasi terverifikasi dari sekolah.')}
        <p role="status">${esc(message)}</p>
        <button id="retry-portal" style="${isError ? '' : 'display:none;'}">Coba lagi</button>
        <div id="login-scanner-container" style="display:none; margin-top: 1rem;">
          <div id="login-qr-reader"></div>
          <button type="button" id="cancel-scan-btn" class="btn-secondary" style="margin-top:0.5rem; width:100%;">Batal Scan</button>
        </div>
        <button id="start-scan-btn" style="margin-top: 1rem; width:100%;">Pindai QR Akses</button>
        ${gateHelp}
      </section>
    </main>
  `;

  document.getElementById("retry-portal")?.addEventListener("click", () => void start());
  document.getElementById("start-scan-btn")?.addEventListener("click", async () => {
    document.getElementById("start-scan-btn")!.style.display = "none";
    document.getElementById("retry-portal")!.style.display = "none";
    document.getElementById("login-scanner-container")!.style.display = "block";
    try {
      loginScanner ??= new Html5Qrcode("login-qr-reader");
      await loginScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, decoded => {
        try {
          const url = new URL(decoded);
          if (url.hash.includes("token=") || url.searchParams.has("token")) {
            void loginScanner?.stop().catch(() => {});
            window.location.href = decoded;
          }
        } catch {}
      }, () => undefined);
    } catch {
      document.getElementById("login-scanner-container")!.style.display = "none";
      document.getElementById("start-scan-btn")!.style.display = "block";
    }
  });

  document.getElementById("cancel-scan-btn")?.addEventListener("click", async () => {
    if (loginScanner) { try { await loginScanner.stop(); } catch {} }
    document.getElementById("login-scanner-container")!.style.display = "none";
    document.getElementById("start-scan-btn")!.style.display = "block";
  });
}

function parentLayout(contentHTML: string, activeTab: "home" | "add" | "profile" = "home"): string {
  return `
    <div class="parent-shell">
      <header class="aksis-pwa-header parent-header">
        <div class="brand">
          <img src="${import.meta.env.BASE_URL}logo.png" alt="AKSIS Logo">
          <div class="brand-text">
            <div class="brand-title">AKSIS</div>
            <div class="brand-subtitle">Kontrol Orang Tua</div>
          </div>
        </div>
        <div class="header-right"></div>
      </header>

      <main>
        ${contentHTML}
      </main>

      <nav class="parent-nav" aria-label="Navigasi portal">
        <button id="nav-home" class="${activeTab === 'home' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Beranda</span>
        </button>
        <button id="nav-add" class="${activeTab === 'add' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>Tambah anak</span>
        </button>
        <button id="nav-profile" class="${activeTab === 'profile' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Akses saya</span>
        </button>
      </nav>
    </div>
  `;
}

async function dashboard(): Promise<boolean> {
  const revision = ++viewRevision;
  try {
    const children = await request<Child[]>("/parent/children");
    if (revision !== viewRevision) return false;
    if (!children.length) {
      dashboardVisible = false;
      root.innerHTML = parentLayout(`
        <div class="parent-content">
          <section class="student-profile-card" style="flex-direction: column; text-align: center; padding: 32px 20px;">
            <div class="avatar-fallback" style="margin: 0 auto 12px; width: 64px; height: 64px; font-size: 1.5rem;">♡</div>
            <h2 style="font-size: 1.3rem;">Hubungkan Anak Anda</h2>
            <p style="font-size: 0.88rem; color: var(--parent-text-muted); margin: 6px 0 18px;">
              Masukkan NISN dan Tanggal Lahir untuk memverifikasi data siswa dan memantau aktivitas sekolah.
            </p>
            <button id="link-child-btn" style="width: 100%; max-width: 240px;">Hubungkan Anak</button>
          </section>
        </div>
      `, "home");
      bindGlobalEvents();
      document.getElementById("link-child-btn")?.addEventListener("click", linkView);
      return false;
    }

    const selected = children.find(child => child.student_id === selectedChildId) ?? children[0]!;
    selectedChildId = selected.student_id;

    const data = await request<ParentTodayData>(`/parent/children/${selected.student_id}/today`);

    if (revision !== viewRevision) return false;
    dashboardVisible = true;

    // Older APIs show unavailable totals rather than example figures.
    const profile = data.profile ?? {
      full_name: selected.full_name,
      first_name: selected.full_name.split(/\s+/)[0] ?? "Siswa",
      school_name: selected.school_name,
      class_name: selected.class_name ?? "Belum ada kelas",
      photo_url: null
    };

    const attendance = data.attendance ?? calculateAttendanceFallback(data.events, data.timezone);
    const waste = data.waste ?? calculateWasteFallback(data.events);
    const library = data.library ?? calculateLibraryFallback(data.events);
    const extracurricular = data.extracurricular ?? calculateEkskulFallback(data.events, data.timezone);

    // Formatted date string (e.g., Senin, 28 September 2026)
    const formattedDate = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: data.timezone || "Asia/Makassar"
    }).format(new Date(data.as_of ?? Date.now()));

    const initials = profile.full_name.split(/\s+/).slice(0, 2).map(n => n[0]).join("").toUpperCase();

    // Render Main Dashboard HTML
    const contentHTML = `
      ${children.length > 1 ? `
        <div class="child-picker-container">
          <label class="sr-only" for="child-picker">Pilih anak</label>
          <select id="child-picker" class="child-picker-select">
            ${children.map(c => `<option value="${esc(c.student_id)}" ${c.student_id === selectedChildId ? 'selected' : ''}>Anak: ${esc(c.full_name)}</option>`).join("")}
          </select>
        </div>
      ` : ""}

      <div class="parent-content">
        ${!profile.photo_url ? `
          <div class="photo-warning-banner" style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 1.5px solid #fdba74; border-radius: 16px; padding: 16px 18px; margin-bottom: 18px; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 12px rgba(234,88,12,0.08);">
            <div style="background: #ea580c; color: white; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📷</div>
            <div style="flex: 1;">
              <h4 style="margin: 0 0 4px; font-size: 0.95rem; font-weight: 700; color: #9a3412;">Aksi Diperlukan: Unggah Foto Siswa</h4>
              <p style="margin: 0; font-size: 0.82rem; color: #c2410c;">Foto resmi sekolah diperlukan untuk pencetakan ID Card PVC ${esc(profile.first_name)}.</p>
            </div>
            <button type="button" id="btn-open-photo-modal" style="background: #ea580c; border: none; padding: 8px 16px; border-radius: 10px; color: white; font-weight: 700; font-size: 0.85rem; cursor: pointer; white-space: nowrap;">Unggah Foto</button>
          </div>
        ` : ""}

        <!-- Student Profile Card -->
        <section class="student-profile-card" style="cursor:pointer;" title="Klik untuk mengubah foto siswa">
          <div class="student-avatar-wrap">
            ${profile.photo_url ? `
              <img src="${esc(profile.photo_url)}" class="student-avatar" alt="${esc(profile.full_name)}" />
            ` : `
              <div class="avatar-fallback">${esc(initials)}</div>
            `}
          </div>
          <div class="student-details">
            <h2>${esc(profile.full_name)}</h2>
            <div class="info-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14M21 7v14M6 21V11M18 21V11M12 21V4M12 4L4 7M12 4l8 3"/></svg>
              <span>${esc(profile.school_name)}</span>
            </div>
            <div class="info-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
              <span>${esc(profile.class_name)}</span>
            </div>
            <div class="info-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${esc(formattedDate)}</span>
            </div>
          </div>
        </section>

        <!-- 2x2 Grid -->
        <div class="parent-grid">
          <!-- Card 1: Attendance -->
          <div class="grid-card card-attendance" id="card-attendance">
            <div>
              <div class="card-top">
                <div class="card-top-header">
                  <div class="icon-badge green">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <span class="card-title">Kehadiran Hari Ini</span>
                </div>
                <span class="card-arrow">&rsaquo;</span>
              </div>

              ${renderAttendancePill(attendance.status)}
            </div>

            <div class="time-cols">
              <div class="time-box">
                <label>Jam Datang</label>
                <span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  ${esc(attendance.check_in)}
                </span>
              </div>
              <div class="time-box" style="text-align: right; align-items: flex-end;">
                <label>Jam Pulang</label>
                <span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  ${esc(attendance.check_out)}
                </span>
              </div>
            </div>
          </div>

          <!-- Card 2: Waste Points -->
          <div class="grid-card card-waste" id="card-waste">
            <div>
              <div class="card-top">
                <div class="card-top-header">
                  <div class="icon-badge green">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
                  </div>
                  <span class="card-title">Poin Sampah</span>
                </div>
                <span class="card-arrow">&rsaquo;</span>
              </div>

              <div class="waste-body">
                <div class="donut-gauge" aria-label="Total poin tercatat">
                  <div class="donut-center">
                    <span class="donut-val">${number(waste.total_points)}</span>
                    <span class="donut-lbl">poin</span>
                  </div>
                </div>
                <div class="waste-info">
                  <span class="sub">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/></svg>
                    Setoran hari ini
                  </span>
                  <span class="val">${number(waste.today_kg)} kg</span>
                </div>
              </div>
            </div>

            <div class="card-banner teal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>${waste.unscored ? "Sebagian setoran belum memiliki nilai poin." : "Terus jaga lingkungan sekolah tetap bersih!"}</span>
            </div>
          </div>

          <!-- Card 3: Library Visits -->
          <div class="grid-card card-library" id="card-library">
            <div>
              <div class="card-top">
                <div class="card-top-header">
                  <div class="icon-badge blue">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  </div>
                  <span class="card-title">Kunjungan Perpustakaan</span>
                </div>
                <span class="card-arrow">&rsaquo;</span>
              </div>

              <div class="stat-primary">
                <span class="big-num">${library.today_visits}</span>
                <span class="unit">kunjungan hari ini</span>
              </div>
              <div class="stat-sub">
                Total bulan ini <b>${number(library.month_visits)} kunjungan</b>
              </div>
            </div>

            <div class="card-banner blue">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span>Membaca membuka lebih banyak peluang!</span>
            </div>
          </div>

          <!-- Card 4: Extracurricular -->
          <div class="grid-card card-ekskul" id="card-ekskul">
            <div>
              <div class="card-top">
                <div class="card-top-header">
                  <div class="icon-badge orange">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  </div>
                  <span class="card-title">Ekstrakurikuler</span>
                </div>
                <span class="card-arrow">&rsaquo;</span>
              </div>

              <div class="ekskul-title">${esc(extracurricular.name)}</div>${(extracurricular.activities_count ?? 0) > 1 ? `<p class="activity-count">${extracurricular.activities_count} kegiatan hari ini · lihat detail</p>` : ""}

              <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0 6px;">
                <span style="font-size: 0.72rem; color: var(--parent-text-muted); display: flex; align-items: center; gap: 4px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                </span>
                <span style="font-size: 0.78rem; font-weight: 800; padding: 2px 8px; border-radius: 8px; background: ${extracurricular.status === 'HADIR' ? '#d4f1e3' : '#edf2ef'}; color: ${extracurricular.status === 'HADIR' ? '#115c3c' : '#557065'};">
                  ${({ HADIR: "✔ Hadir", IZIN: "Izin", ALPA: "Tidak hadir", TIDAK_ADA: "Tidak ada jadwal", BELUM_HADIR: "Belum presensi" })[extracurricular.status]}
                </span>
              </div>

              <div class="ekskul-time">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${esc(extracurricular.schedule ?? (extracurricular.time_attended !== "—" ? `Presensi ${extracurricular.time_attended}` : "Belum ada jadwal hari ini"))}</span>
              </div>
            </div>

            <div class="card-banner warm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
              <span>Terus kembangkan bakat dan minatmu!</span>
            </div>
          </div>
        </div>

        <!-- Motivation Banner -->
        <section class="motivation-card">
          <div class="star-circle">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div class="motivation-text">
            <h3>Terus semangat, ${esc(profile.first_name)}!</h3>
            <p>Kami selalu mendukung langkah terbaikmu.</p>
          </div>
        </section>
      </div>

      <div class="refresh-row"><span>Data sekolah · ${esc(new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: data.timezone }).format(new Date(data.as_of ?? Date.now())))}</span><button id="refresh-dashboard" class="btn-secondary">Perbarui data</button></div>
      <dialog id="timeline-drawer" class="modal-overlay" aria-labelledby="drawer-title">
        <div class="drawer-card">
          <div class="drawer-head">
            <h3 id="drawer-title">Aktivitas Hari Ini (${esc(profile.first_name)})</h3>
            <button class="drawer-close" id="close-drawer-btn" aria-label="Tutup aktivitas">&times;</button>
          </div>
          <div class="timeline-content">
            ${data.events.length ? renderTimelineEvents(data.events, data.timezone) : `
              <div class="empty compact" style="padding: 24px 0;">
                <span>○</span>
                <h3>Belum ada aktivitas hari ini</h3>
                <p>Aktivitas terverifikasi dari gerbang, sampah, dan perpustakaan akan otomatis muncul di sini.</p>
              </div>
            `}
          </div>
        </div>
      </dialog>
    `;

    root.innerHTML = parentLayout(contentHTML, "home");
    bindGlobalEvents();

    document.getElementById("btn-open-photo-modal")?.addEventListener("click", () => openPhotoCropperModal(selected.student_id, profile.full_name));
    document.querySelector(".student-profile-card")?.addEventListener("click", () => openPhotoCropperModal(selected.student_id, profile.full_name));

    const drawer = document.querySelector<HTMLDialogElement>("#timeline-drawer")!;
    const openDrawer = (prefix = "") => {
      const events = data.events.filter(event => event.type.startsWith(prefix));
      const labels: Record<string, string> = { "attendance.": "Kehadiran", "waste.": "Bank Sampah", "library.": "Perpustakaan", "extracurricular.": "Ekstrakurikuler" };
      document.getElementById("drawer-title")!.textContent = `${labels[prefix] ?? "Aktivitas"} hari ini`;
      drawer.querySelector(".timeline-content")!.innerHTML = events.length ? renderTimelineEvents(events, data.timezone) : '<p class="empty">Belum ada aktivitas tercatat hari ini.</p>';
      drawer.showModal();
    };
    document.getElementById("btn-notifications")?.addEventListener("click", () => openDrawer());
    for (const [id, prefix] of [["attendance", "attendance."], ["waste", "waste."], ["library", "library."], ["ekskul", "extracurricular."]]) {
      const card = document.getElementById(`card-${id}`)!;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-label", `Lihat detail ${card.querySelector(".card-title")!.textContent}`);
      card.addEventListener("click", () => openDrawer(prefix));
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDrawer(prefix); }
      });
    }
    document.getElementById("close-drawer-btn")?.addEventListener("click", () => drawer.close());
    drawer.addEventListener("click", event => { if (event.target === drawer) drawer.close(); });
    document.getElementById("refresh-dashboard")?.addEventListener("click", () => void dashboard());
    document.querySelector<HTMLImageElement>(".student-avatar")?.addEventListener("error", event => {
      (event.target as HTMLImageElement).parentElement!.innerHTML = `<div class="avatar-fallback">${esc(initials)}</div>`;
    });

    document.querySelector<HTMLSelectElement>('#child-picker')?.addEventListener('change', event => {
      selectedChildId = (event.target as HTMLSelectElement).value;
      void dashboard();
    });

    return true;
  } catch (error) {
    if (revision === viewRevision) loginView(error instanceof Error ? error.message : "Belum dapat memuat aktivitas.", true);
    return false;
  }
}

function renderAttendancePill(status: string): string {
  switch (status) {
    case "PULANG":
      return `<div class="status-pill green">✔ Sudah Pulang</div>`;
    case "TERLAMBAT":
      return `<div class="status-pill orange">⚠ Terlambat</div>`;
    case "HADIR":
      return `<div class="status-pill green">✔ Hadir</div>`;
    default:
      return `<div class="status-pill gray">○ Belum Hadir</div>`;
  }
}

function renderTimelineEvents(events: ParentTodayData["events"], timezone: string): string {
  return `
    <div class="timeline">
      ${events.map(ev => {
        let title = "Aktivitas", desc = ev.extra_info || "", icon = "✓", color = "#146c43";
        if (ev.type === "attendance.check_in") { title = "Tiba di sekolah"; desc = ev.is_late ? "Tercatat terlambat" : "Terverifikasi gerbang sekolah"; icon = "🏢"; }
        else if (ev.type === "attendance.check_out") { title = "Pulang dari sekolah"; desc = "Terverifikasi gerbang sekolah"; icon = "🏠"; }
        else if (ev.type === "waste.transaction") { title = "Bank Sampah"; icon = "♻"; color = "#214b38"; }
        else if (ev.type === "library.visit") { title = "Perpustakaan"; icon = "📚"; color = "#0f5132"; }
        else if (ev.type === "extracurricular.attendance") { title = "Ekstrakurikuler"; icon = "🏅"; color = "#243b67"; }
        return `
          <article style="display: grid; grid-template-columns: 50px 12px 1fr 25px; gap: 12px; padding: 14px 0; border-bottom: 1px solid #edf1f4;">
            <time style="font-size: 0.8rem; font-weight: 700; color: #5b796d;">${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone || "Asia/Makassar" }).format(new Date(ev.occurred_at))}</time>
            <i style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; margin-top: 6px;"></i>
            <div>
              <strong style="color: ${color}; font-size: 0.92rem;">${title}</strong>
              <p style="font-size: 0.82rem; margin: 2px 0 0; color: #5b796d;">${esc(desc)}</p>
            </div>
            <b style="color: ${color}">${icon}</b>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

// Fallback calculations for seamless backward compatibility
function calculateAttendanceFallback(events: ParentTodayData["events"], timezone: string) {
  const checkIn = events.filter(e => e.type === "attendance.check_in").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0];
  const checkOut = events.find(e => e.type === "attendance.check_out");
  const isLate = checkIn?.is_late ?? false;

  let status: "HADIR" | "TERLAMBAT" | "PULANG" | "BELUM_HADIR" = "BELUM_HADIR";
  if (checkOut) status = "PULANG";
  else if (checkIn && isLate) status = "TERLAMBAT";
  else if (checkIn) status = "HADIR";

  const fmt = (iso?: string) => iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(iso)) : "—";
  return { status, check_in: fmt(checkIn?.occurred_at), check_out: fmt(checkOut?.occurred_at) };
}

function calculateWasteFallback(events: ParentTodayData["events"]) {
  const wasteEvents = events.filter(e => e.type === "waste.transaction");
  let todayKg = 0;
  for (const e of wasteEvents) {
    const match = e.extra_info?.match(/([\d.,]+)\s*kg/i);
    if (match?.[1]) todayKg += parseFloat(match[1].replace(",", "."));
  }
  return { today_kg: todayKg, total_points: null, today_points: null, unscored: wasteEvents.length };
}

function calculateLibraryFallback(events: ParentTodayData["events"]) {
  const count = events.filter(e => e.type === "library.visit").length;
  return { today_visits: count, month_visits: null };
}

function calculateEkskulFallback(events: ParentTodayData["events"], timezone: string) {
  const ekskul = events.find(e => e.type === "extracurricular.attendance");
  const name = ekskul?.extra_info ? ekskul.extra_info.replace(/^Kehadiran Ekskul\s*/i, "") : "Belum ada data kegiatan";
  const status: "HADIR" | "BELUM_HADIR" = ekskul ? "HADIR" : "BELUM_HADIR";
  const fmt = (iso?: string) => iso ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(iso)) : "—";
  return { name, status, time_attended: fmt(ekskul?.occurred_at), schedule: null, activities_count: 0 };
}

function bindGlobalEvents() {
  document.getElementById("nav-home")?.addEventListener("click", () => void dashboard());
  document.getElementById("nav-add")?.addEventListener("click", linkView);
  document.getElementById("nav-profile")?.addEventListener("click", profileView);
  document.getElementById("btn-menu-drawer")?.addEventListener("click", profileView);
  if (!dashboardVisible) document.getElementById("btn-notifications")?.setAttribute("hidden", "");
}

function linkView() {
  viewRevision++;
  dashboardVisible = false;
  root.innerHTML = parentLayout(`
    <div class="parent-content">
      <form class="link-card" id="link-form" style="background: white; border-radius: 22px; padding: 24px; border: 1px solid #e1efe8;">
        <small style="color: var(--parent-green-accent); font-weight: 800; letter-spacing: 0.1em;">TAUTAN AMAN</small>
        <h2 style="margin: 8px 0 6px; font-size: 1.3rem;">Hubungkan Anak</h2>
        <p style="font-size: 0.88rem; color: var(--parent-text-muted); margin-bottom: 20px;">
          Gunakan NISN dan Tanggal Lahir anak Anda untuk memverifikasi data resmi sekolah.
        </p>
        <div id="error" class="error-msg" style="margin-bottom: 12px;"></div>

        <label style="display: block; margin-bottom: 14px;">
          Nama Orang Tua / Wali
          <input name="name" required maxlength="200" style="margin-top: 6px;" placeholder="Nama lengkap Anda" />
        </label>

        <label style="display: block; margin-bottom: 14px;">
          NISN Siswa
          <input name="nisn" required maxlength="50" style="margin-top: 6px;" placeholder="10 digit NISN" />
        </label>

        <label style="display: block; margin-bottom: 20px;">
          Tanggal Lahir Siswa
          <input type="date" name="dob" required style="margin-top: 6px;" />
        </label>

        <button style="width: 100%;">Verifikasi & Hubungkan</button>
        <button type="button" class="btn-secondary" id="cancel-link" style="width: 100%; margin-top: 8px;">Batal</button>
      </form>
    </div>
  `, "add");

  bindGlobalEvents();
  document.getElementById("cancel-link")?.addEventListener("click", () => void dashboard());

  const form = document.querySelector<HTMLFormElement>("#link-form")!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const errorEl = document.getElementById("error")!;
    errorEl.textContent = "Memverifikasi data anak…";
    const submit = form.querySelector<HTMLButtonElement>("button:not([type])")!;
    submit.disabled = true;
    try {
      await request("/parent/link", {
        method: "POST",
        body: JSON.stringify({ nisn: d.get("nisn"), dob: d.get("dob"), full_name: d.get("name") })
      });
      await dashboard();
      offerInstall();
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : "Data anak tidak ditemukan atau tidak cocok.";
    } finally { submit.disabled = false; }
  };
}

function profileView() {
  viewRevision++;
  dashboardVisible = false;
  root.innerHTML = parentLayout(`
    <div class="parent-content">
      <section class="profile-card" style="background: white; border-radius: 22px; padding: 24px; border: 1px solid #e1efe8;">
        <small style="color: var(--parent-green-accent); font-weight: 800; letter-spacing: 0.1em;">AKSES SAYA</small>
        <h2 style="margin: 8px 0 16px; font-size: 1.3rem;">Informasi Portal Orang Tua</h2>
        <dl style="display: grid; gap: 14px; margin: 0 0 20px;">
          <div>
            <dt style="font-size: 0.8rem; color: var(--parent-text-muted);">Sekolah Terhubung</dt>
            <dd style="margin: 2px 0 0; font-weight: 800; font-size: 1rem;">${esc(portal.context?.school_name)}</dd>
          </div>
          <div>
            <dt style="font-size: 0.8rem; color: var(--parent-text-muted);">Status Akses</dt>
            <dd style="margin: 2px 0 0; font-weight: 800; font-size: 1rem; color: #1c7352;">Terverifikasi QR Admin Sekolah</dd>
          </div>
        </dl>
        <p style="font-size: 0.85rem; color: var(--parent-text-muted); line-height: 1.5; margin-bottom: 24px;">
          Akses ini terenkripsi dan terhubung langsung ke server sekolah. Hubungi admin sekolah apabila terdapat kendala data anak.
        </p>
        <div class="persistent-access-note">
          <strong>Akses tersimpan di perangkat ini</strong>
          <span>Portal akan tetap terhubung selama akses belum dicabut oleh Admin Sekolah.</span>
        </div>
      </section>
    </div>
  `, "profile");

  bindGlobalEvents();
}

async function start() {
  loginView("Membuka akses sekolah…");
  try {
    if (!await portal.start()) {
      loginView("Pindai QR Akses dari admin sekolah untuk masuk.", false);
      return;
    }
    const hasChildren = await dashboard();
    if (hasChildren) offerInstall();
  } catch (error) {
    loginView(error instanceof Error ? error.message : "Belum dapat terhubung.", true);
  }
}

void start();
