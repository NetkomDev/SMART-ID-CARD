import { mountPlatformPage, registerSchoolDevice } from "./platform/pages";
import { mountCommandCenter } from "./dashboard/command-center";
import { ApiClientError, api, login } from "./lib/api";
import { canAccess, isPlatformRoute } from "./lib/permissions";
import { clearSession, getSession, setSchoolId, setSession } from "./lib/session";
import type { AcademicYear, Attendance, AuthContext, Card, Device, Extracurricular, LedContent, School, SchoolClass, Student } from "./lib/types";
import { renderLandingPage } from "./landing";
import { toast, toastSuccess, toastError } from "./lib/toast";
import { optimistic, removeRowOptimistic } from "./lib/optimistic";
import * as XLSX from "xlsx";

const savedTheme = localStorage.getItem("aksis-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.documentElement.setAttribute("data-theme", savedTheme);

function getThemeIconHtml(): string {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return isDark
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
}

function updateThemeIcon(): void {
  const btn = document.querySelector<HTMLElement>("[data-action='toggle-theme']");
  if (btn) {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.innerHTML = getThemeIconHtml();
    btn.setAttribute("title", isDark ? "Aktifkan Mode Terang" : "Aktifkan Mode Gelap");
    btn.setAttribute("aria-label", isDark ? "Aktifkan Mode Terang" : "Aktifkan Mode Gelap");
  }
}

type AppState = {
  school?: School;
  context?: AuthContext;
  userEmail?: string;
  allSchools?: School[];
};

const state: AppState = {};
let disposeDashboard: (() => void) | undefined;
function clearDashboard() { disposeDashboard?.(); disposeDashboard = undefined; }

function getApp(): HTMLDivElement {
  let el = document.querySelector<HTMLDivElement>("#app");
  if (!el) {
    el = document.createElement("div");
    el.id = "app";
    document.body.appendChild(el);
  }
  return el;
}

const navItems = [
  ["/", "Ringkasan", "⌂"],
  ["/academic-years", "Tahun Ajaran", "📅"],
  ["/students", "Siswa & Kelas", "◎"],
  ["/devices", "Perangkat", "⌁"],
  ["/cards", "Kartu siswa", "▰"],
  ["/pwa-portals", "Portal PWA & QR", "📱"],
  ["/attendance", "Kehadiran", "✓"],
  ["/reports", "Laporan Wali Kelas", "↗"],
  ["/waste", "Bank sampah", "♻"],
  ["/library", "Perpustakaan", "▤"],
  ["/extracurricular", "Ekstrakurikuler", "☆"],
  ["/led", "LED board", "▱"]
] as const;

const superAdminNavItems = [
  ["/platform", "Ringkasan Platform", "🌐"],
  ["/platform-schools", "Daftar Sekolah", "🏢"],
  ["/platform-iam", "IAM & Hak Akses", "🔐"],
  ["/platform-devices", "Monitor Perangkat", "📡"],
  ["/platform-card-templates", "Template Kartu Siswa", "🎨"],
  ["/platform-card-jobs", "Produksi Kartu Siswa", "💳"],
  ["/platform-audit", "Global Audit Logs", "↗"]
] as const;

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[character]!);

function navigate(path: string): void {
  history.pushState({}, "", path);
  void render();
}

function skeleton(rows = 4): string {
  return `<div class="skeleton-stack" aria-label="Memuat data">${Array.from({ length: rows }, () => '<div class="skeleton"></div>').join("")}</div>`;
}

function errorState(error: unknown): string {
  const message = error instanceof ApiClientError ? error.message : "Data belum dapat dimuat. Periksa koneksi lalu coba lagi.";
  return `<div class="state-card state-error" role="alert"><span>!</span><div><strong>Terjadi kendala</strong><p>${escapeHtml(message)}</p></div><button class="button secondary" data-action="retry">Coba lagi</button></div>`;
}

function emptyState(title: string, description: string): string {
  return `<div class="state-card"><span>○</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div></div>`;
}

function loginView(): void {
  clearDashboard();
  getApp().innerHTML = `<main class="login-page" id="main-content">
    <section class="login-story" aria-label="Tentang AKSIS">
      <div class="brand brand-light" style="display:flex;align-items:center;gap:0.75rem;"><img src="/logo.png" alt="AKSIS Logo" style="height: 200px; width: auto; object-fit: contain; filter: drop-shadow(0px 0px 4px rgba(255, 255, 255, 0.8));"></div>
      <div><p class="eyebrow">Ekosistem Sekolah Cerdas</p><h1>Satu pusat kendali untuk seluruh aktivitas sekolah.</h1>
      <p class="story-copy">Integrasikan sistem absensi IoT, kartu pintar pelajar, hingga bank sampah dalam satu platform digital yang aman dan terhubung.</p></div>
      <blockquote>“Mengubah operasional harian yang rumit menjadi wawasan data yang memberdayakan sekolah.”</blockquote>
    </section>
    <section class="login-panel">
      <form class="login-form" id="login-form">
        <div style="margin-bottom:0.5rem;"><a href="/" id="back-to-landing" style="font-size:0.85rem;color:var(--muted);font-weight:600;display:inline-flex;align-items:center;gap:0.4rem;">← Kembali ke Beranda AKSIS</a></div>
        <div><p class="eyebrow dark">Portal Admin</p><h2>Selamat datang kembali</h2><p>Masuk menggunakan akun sekolah atau Super Admin Anda.</p></div>
        <div id="login-error" aria-live="polite"></div>
        <label>Email<input name="email" type="email" autocomplete="username" placeholder="admin@sekolah.sch.id" required /></label>
        <label>Kata sandi
          <div style="position: relative; width: 100%;">
            <input name="password" id="login-password-input" type="password" autocomplete="current-password" minlength="8" placeholder="Minimal 8 karakter" required style="padding-right: 2.75rem;" />
            <button type="button" id="toggle-password-btn" title="Tampilkan/Sembunyikan password" aria-label="Tampilkan atau sembunyikan kata sandi" style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted); display: flex; align-items: center; justify-content: center; padding: 0.25rem; border-radius: 0.375rem; transition: color 0.2s ease;">
              <svg id="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </label>
        <button class="button primary wide" type="submit">Masuk ke AKSIS <span>→</span></button>
        <small>Sesi disimpan hanya selama tab browser aktif. AKSIS tidak pernah menyimpan service-role key di browser.</small>
      </form>
    </section>
  </main>`;

  document.getElementById("back-to-landing")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });

  const toggleBtn = document.getElementById("toggle-password-btn");
  const pwdInput = document.getElementById("login-password-input") as HTMLInputElement | null;
  const eyeIcon = document.getElementById("eye-icon");

  toggleBtn?.addEventListener("click", () => {
    if (!pwdInput || !eyeIcon) return;
    const isPassword = pwdInput.type === "password";
    pwdInput.type = isPassword ? "text" : "password";
    eyeIcon.innerHTML = isPassword
      ? `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line>`
      : `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>`;
  });
  document.querySelector<HTMLFormElement>("#login-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>("button")!;
    const data = new FormData(form);
    button.disabled = true; button.textContent = "Memverifikasi…";
    try {
      const result = await login(String(data.get("email")), String(data.get("password")));
      if (!result.data.platform_admin && !result.data.schools.length) throw new ApiClientError("FORBIDDEN", "Akun belum terhubung ke sekolah aktif.", 403);
      setSession(result.data.session);
      if (result.data.schools[0]) setSchoolId(result.data.schools[0].school_id);
      state.userEmail = result.data.user.email;
      await bootstrap();
      if (state.context?.roles.includes("SUPER_ADMIN")) {
        navigate("/platform");
      } else {
        navigate("/");
      }
    } catch (error) {
      document.querySelector("#login-error")!.innerHTML = errorState(error);
    } finally { button.disabled = false; button.textContent = "Masuk ke AKSIS →"; }
  });
}

async function bootstrap(): Promise<void> {
  const session = await api<{ platform_admin: boolean; user: { email?: string } }>("/auth/session");
  state.userEmail = session.data.user.email;
  if (session.data.platform_admin) {
    state.allSchools = (await api<School[]>("/platform/schools")).data;
    state.school = { id: "", code: "PLATFORM", name: "Platform AKSIS" };
    state.context = { school_id: "", membership_id: "", roles: ["SUPER_ADMIN"], permissions: [] };
    return;
  }
  state.allSchools = undefined;
  const [school, context] = await Promise.all([api<School>("/schools/current"), api<AuthContext>("/schools/current/context")]);
  state.school = school.data; state.context = context.data;
}

function shell(content: string, title: string, subtitle: string): void {
  clearDashboard();
  const path = location.pathname;
  const isSuperAdmin = state.context?.roles.includes("SUPER_ADMIN");
  const isPlatformPath = path.startsWith("/platform");
  const initials = isPlatformPath ? "🌐" : (state.school?.name ?? "AKSIS").split(" ").slice(0, 2).map((part) => part[0]).join("");

  const visibleNav = navItems.filter(([route]) => canAccess(route, state.context?.permissions ?? [], state.context?.roles ?? []));

  let sidebarNavHtml = "";
  if (isSuperAdmin) {
    sidebarNavHtml = `
      <div style="padding:0.6rem 0.75rem 0.2rem;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;color:var(--lime);text-transform:uppercase;">SUPER ADMIN PLATFORM</div>
      ${superAdminNavItems.map(([route, label, icon]) => `<a href="${route}" data-link class="${path === route ? "active" : ""}"><span>${icon}</span>${label}</a>`).join("")}
    `;
  } else {
    sidebarNavHtml = `
      <div style="padding:0.8rem 0.75rem 0.2rem;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;color:#8da29b;text-transform:uppercase;">OPERASIONAL SEKOLAH</div>
      ${visibleNav.map(([route, label, icon]) => `<a href="${route}" data-link class="${path === route ? "active" : ""}"><span>${icon}</span>${label}</a>`).join("")}
    `;
  }

  const schoolSwitchHtml = isSuperAdmin ? "" : `
    <div class="school-switch"><div><small>Sekolah aktif</small><strong>${escapeHtml(state.school?.name)}</strong></div></div>
  `;

  getApp().innerHTML = `<div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand" style="display:flex;align-items:center;gap:0.75rem;"><img src="/logo.png" alt="AKSIS Logo" style="height: 96px; width: auto; object-fit: contain; filter: drop-shadow(0px 0px 4px rgba(255, 255, 255, 0.8));"></div>
      <nav aria-label="Navigasi utama">
        ${sidebarNavHtml}
      </nav>
      <div class="sidebar-foot"><span class="status-dot"></span><div><strong>Sistem aktif</strong><small>${isSuperAdmin ? "Super Admin Mode" : "Semua layanan normal"}</small></div></div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <button class="topbar-btn menu-button" data-action="menu" aria-label="Buka navigasi">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
        ${schoolSwitchHtml}
        <div class="top-actions" style="margin-left: auto;">
          <button class="topbar-btn theme-toggle" data-action="toggle-theme" aria-label="Ubah Mode Gelap/Terang" title="Ubah Mode Gelap/Terang">
            ${getThemeIconHtml()}
          </button>
          <button class="topbar-btn" aria-label="Notifikasi" title="Notifikasi">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          </button>
          <div class="profile-card">
            <div class="profile-avatar">${isSuperAdmin ? "👑" : escapeHtml(initials)}</div>
            <div class="profile-info">
              <span class="profile-email">${escapeHtml(state.userEmail ?? "Admin")}</span>
              <span class="profile-role">${escapeHtml(state.context?.roles[0] ?? "SCHOOL_ADMIN")}</span>
            </div>
          </div>
          <button class="topbar-btn logout-btn" data-action="logout" aria-label="Keluar" title="Keluar dari Akun">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>
      <main class="content" id="main-content"><div class="page-heading"><div><p class="eyebrow dark">${isPlatformPath ? "PLATFORM SUPER ADMIN" : escapeHtml(state.school?.code ?? "SEKOLAH")}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><span class="date-chip">${new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span></div>${content}</main>
    </div><div class="sidebar-scrim" data-action="menu"></div></div>`;
  bindShellEvents();
}

function bindShellEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-link]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault(); navigate(link.getAttribute("href")!);
  }));
  document.querySelectorAll<HTMLElement>("[data-action='menu']").forEach((button) => button.addEventListener("click", () => document.body.classList.toggle("nav-open")));
  document.querySelector<HTMLElement>("[data-action='toggle-theme']")?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("aksis-theme", newTheme);
    updateThemeIcon();
  });
  document.querySelector<HTMLElement>("[data-action='logout']")?.addEventListener("click", async () => {
    const session = getSession();
    try {
      if (session) await api<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) }, false);
    } catch { /* Local logout still clears potentially stale credentials. */ }
    clearSession(); state.context = undefined; state.school = undefined; loginView();
  });
  document.querySelector<HTMLElement>("[data-action='retry']")?.addEventListener("click", () => void render());
}

function relation<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }
function formatTime(value?: string | null): string { return value ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }

async function dashboardPage(): Promise<void> {
  shell('<div id="school-command-center"></div>', "Command Center", "Pantau metrik utama dan aktivitas sekolah hari ini.");
  // The dashboard supplies its own responsive heading, including the TV toggle.
  document.querySelector(".page-heading")?.remove();
  disposeDashboard = mountCommandCenter(document.getElementById("school-command-center")!, {
    school: state.school!, permissions: state.context?.permissions ?? [], roles: state.context?.roles ?? [], navigate
  });
}

function tablePage<T>(options: { title: string; subtitle: string; path: string; columns: string[]; row: (item: T) => string; action?: { label: string; href: string } }): void {
  shell(`<section class="panel"><div class="panel-head"><div class="search-box"><span>⌕</span><input id="table-search" type="search" placeholder="Cari data…" aria-label="Cari data" /></div>${options.action ? `<a class="button primary" data-link href="${options.action.href}">${options.action.label}</a>` : ""}</div><div id="table-data">${skeleton(6)}</div></section>`, options.title, options.subtitle);
  const load = async (search = "") => {
    try {
      const separator = options.path.includes("?") ? "&" : "?";
      const response = await api<T[]>(`${options.path}${separator}page=1&page_size=30${search ? `&search=${encodeURIComponent(search)}` : ""}`);
      document.querySelector("#table-data")!.innerHTML = response.data.length ? `<div class="table-wrap"><table><thead><tr>${options.columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead><tbody>${response.data.map(options.row).join("")}</tbody></table></div><div class="table-footer">Menampilkan ${response.data.length} dari ${response.meta?.total ?? response.data.length} data</div>` : emptyState("Data belum tersedia", "Tambahkan data pertama untuk memulai.");
    } catch (error) { document.querySelector("#table-data")!.innerHTML = errorState(error); }
  };
  let timer = 0;
  document.querySelector<HTMLInputElement>("#table-search")?.addEventListener("input", (event) => { window.clearTimeout(timer); timer = window.setTimeout(() => void load((event.target as HTMLInputElement).value), 300); });
  void load();
}

async function studentsPage(): Promise<void> {
  let selectedClassId: string | null = null;
  let currentSearch = "";

  shell(`<section class="dashboard-grid" style="grid-template-columns: 320px 1fr; align-items: start;">
    <div style="display:flex; flex-direction:column; gap:1.5rem;">
      <article class="panel">
        <div class="panel-head">
          <h2>Master Kelas</h2>
          <button id="btn-add-class" class="button secondary" style="padding:0.3rem 0.6rem;font-size:0.75rem;">+ Tambah</button>
        </div>
        <div id="classes-data">${skeleton(4)}</div>
      </article>
      <article class="panel">
        <div class="panel-head">
          <h2>Profil & Kepala Sekolah</h2>
        </div>
        <form id="principal-form" class="sa-form" style="margin-top:0.5rem;display:flex;flex-direction:column;gap:1rem;">
          <label>Nama Lengkap Kepala Sekolah<input type="text" id="principal-name" placeholder="Nama beserta gelar" /></label>
          <label>NIP Kepala Sekolah<input type="text" id="principal-nip" placeholder="NIP (contoh: 19700101 199512 1 001)" /></label>
          <label>Upload Logo Sekolah<input type="file" id="school-logo-file" accept="image/*" /></label>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.85rem;margin-top:-0.5rem;cursor:pointer;color:var(--text);"><input type="checkbox" id="school-logo-remove-bg" checked /> Hapus Background Otomatis (Transparan)</label>
          <img id="logo-preview" style="max-height: 90px; object-fit: contain; border: 1px dashed var(--line); padding: 6px; display: none; background: repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 16px 16px; border-radius: 0.5rem;" alt="Preview Logo" />
          <input type="hidden" id="school-logo-base64" />
          <label>Upload Tanda Tangan Kepala Sekolah<input type="file" id="principal-signature-file" accept="image/*" /></label>
          <img id="signature-preview" style="max-height: 80px; object-fit: contain; border: 1px dashed var(--line); padding: 4px; display: none; background: #f8fafc;" alt="Preview TTD" />
          <input type="hidden" id="principal-signature-base64" />
          <div style="display:flex;gap:0.75rem;align-items:center;">
            <button type="submit" id="btn-save-principal" class="button primary" style="flex:1;">Simpan</button>
            <button type="button" id="btn-cancel-principal" class="button secondary" style="display:none;padding:0.6rem 1rem;">Batal</button>
          </div>
        </form>
      </article>
    </div>
    <article class="panel">
      <div class="panel-head" style="flex-wrap: wrap; gap: 0.75rem;">
        <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width: 250px;">
          <div class="search-box" style="flex:1;"><span>⌕</span><input id="table-search" type="search" placeholder="Cari nama/NISN/NIS…" aria-label="Cari data" /></div>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <a class="button secondary" data-link href="/class-promotion">↗ Naik Kelas Massal</a>
          <a class="button primary" data-link href="/student-import">↥ Import Siswa</a>
        </div>
      </div>
      <div id="active-filter-indicator" style="padding: 0.5rem 1rem; background: var(--accent-light, rgba(59,130,246,0.1)); border-bottom: 1px solid var(--line); display: none; justify-content: space-between; align-items: center; font-size: 0.875rem;">
        <span>Terfilter berdasarkan: <strong id="filter-class-name"></strong></span>
        <button id="btn-clear-filter" class="button secondary" style="padding: 0.15rem 0.5rem; font-size: 0.75rem;">Tampilkan Semua Siswa</button>
      </div>
      <div id="table-data">${skeleton(6)}</div>
    </article>
  </section>
  
  <div id="student-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:9999;overflow-y:auto;padding:2rem;">
    <div style="background:var(--bg);max-width:500px;margin:auto;border-radius:1rem;padding:2rem;position:relative;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
      <button id="close-student-modal" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text);">&times;</button>
      <h2 id="student-modal-title">Edit Data Siswa</h2>
      <form id="student-edit-form" class="login-form" style="margin-top:1rem;">
        <input type="hidden" id="edit-student-id" />
        <label>Nama Lengkap<input type="text" id="edit-full-name" required /></label>
        <label>NISN<input type="text" id="edit-nisn" required /></label>
        <label>Tempat Lahir<input type="text" id="edit-pob" placeholder="Cth: Jakarta" /></label>
        <label>Tanggal Lahir (YYYY-MM-DD)<input type="date" id="edit-dob" /></label>
        <label>Alamat<input type="text" id="edit-address" placeholder="Cth: Jl. Merdeka No. 10" /></label>
        <label>Jenis Kelamin
          <select id="edit-gender" style="width:100%;padding:.85rem;border-radius:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--text);">
            <option value="MALE">Laki-laki (L)</option>
            <option value="FEMALE">Perempuan (P)</option>
          </select>
        </label>
        <label>Status Siswa
          <select id="edit-status" style="width:100%;padding:.85rem;border-radius:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--text);">
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
        <div style="display:flex;gap:1rem;margin-top:1.5rem;">
          <button class="button primary" type="submit" id="btn-save-student">Simpan Perubahan</button>
          <button class="button secondary" type="button" id="btn-cancel-student">Batal</button>
        </div>
      </form>
    </div>
  </div>
  
  <div id="add-class-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:9999;overflow-y:auto;padding:2rem;">
    <div style="background:var(--bg);max-width:450px;margin:auto;border-radius:1rem;padding:2rem;position:relative;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
      <button id="close-add-class-modal" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text);">&times;</button>
      <h2>Tambah Kelas</h2>
      <form id="add-class-form" class="sa-form" style="margin-top:1rem;">
        <label>Tingkat Pendidikan
          <select id="add-class-level" required style="width:100%;padding:.85rem;border-radius:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--text);">
            <option value="">Pemuatan data...</option>
          </select>
        </label>
        <label>Grup / Paralel (Pisahkan koma)
          <input type="text" id="add-class-parallel" placeholder="Cth: A, B, C atau IPA 1, IPS 1" />
          <span style="font-size:0.75rem; color:#64748b; margin-top: 0.25rem; display: block; line-height: 1.3;">Kosongkan jika tidak paralel. Jika diisi beberapa, akan otomatis dibuat massal.</span>
        </label>
        <div style="display:flex;gap:1rem;margin-top:1.5rem;">
          <button class="button primary" type="submit" id="btn-save-new-class" style="flex:1;">Simpan Kelas</button>
        </div>
      </form>
    </div>
  </div>`, "Siswa & Kelas", "Kelola daftar siswa dan struktur kelas aktif.");

  const updateLevelDropdown = (schoolObj?: any) => {
    const sName = String(schoolObj?.name || schoolObj?.school_name || state.school?.name || "").toUpperCase();
    const sCode = String(schoolObj?.code || schoolObj?.school_code || state.school?.code || "").toUpperCase();
    const n = `${sName} ${sCode}`;

    let levels = ["1", "2", "3", "4", "5", "6"];
    if (n.includes("SMP") || n.includes("MTS")) {
      levels = ["VII", "VIII", "IX"];
    } else if (n.includes("SMA") || n.includes("SMK") || n.includes("MA")) {
      levels = ["X", "XI", "XII"];
    } else if (n.includes("SD") || n.includes("MI")) {
      levels = ["1", "2", "3", "4", "5", "6"];
    }

    const selectEl = document.getElementById("add-class-level") as HTMLSelectElement | null;
    if (selectEl) {
      selectEl.innerHTML = levels.map(l => `<option value="${l}">Kelas ${l}</option>`).join("");
    }
  };

  // Initial population of levels dropdown
  updateLevelDropdown();

  const loadClasses = async () => {
    try {
      const res = await api<(SchoolClass & { student_count: number })[]>("/classes/summary");
      const rawClasses = res.data ?? [];
      
      // Sort classes sequentially from top to bottom (e.g. VII-A, VII-B, VIII-A, VIII-B, IX-A, IX-B)
      const sortedClasses = [...rawClasses].sort((a, b) => {
        const gA = a.grade_level ?? 0;
        const gB = b.grade_level ?? 0;
        if (gA !== gB) return gA - gB;
        return a.name.localeCompare(b.name, "id", { numeric: true, sensitivity: "base" });
      });

      const totalStudents = sortedClasses.reduce((sum, c) => sum + (c.student_count || 0), 0);
      const isAllSelected = selectedClassId === null;

      const allClassesHeader = `<div id="btn-all-classes" style="padding: 0.6rem 0.8rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; background: ${isAllSelected ? 'var(--accent-light, rgba(59, 130, 246, 0.15))' : 'var(--bg-subtle, rgba(0,0,0,0.02))'}; border-left: ${isAllSelected ? '4px solid var(--accent, #3b82f6)' : '4px solid transparent'}; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s ease;">
        <strong style="font-size:0.875rem; color:${isAllSelected ? 'var(--accent, #3b82f6)' : 'var(--text)'};">Semua Siswa</strong>
        <span class="status ${isAllSelected ? 'success' : 'neutral'}" style="font-size:0.75rem;">${totalStudents} siswa</span>
      </div>`;

      const rowsHtml = sortedClasses.map(c => {
        const isSelected = selectedClassId === c.id;
        const activeStyle = isSelected
          ? `background: var(--accent-light, rgba(59, 130, 246, 0.15)); border-left: 4px solid var(--accent, #3b82f6); font-weight: 600;`
          : `cursor: pointer; transition: background 0.15s ease;`;
        return `<tr class="class-row ${isSelected ? 'active-class-row' : ''}" data-class-id="${c.id}" data-class-name="${escapeHtml(c.name)}" style="${activeStyle}">
          <td><strong style="color:${isSelected ? 'var(--accent, #3b82f6)' : 'var(--text)'};">${escapeHtml(c.name)}</strong></td>
          <td>${c.student_count} siswa</td>
          <td>
            <div style="display:inline-flex;gap:0.3rem;">
              <a href="/student-import?class_id=${c.id}&class_name=${encodeURIComponent(c.name)}" data-link class="button secondary btn-import-class" style="padding:0.2rem 0.5rem;font-size:0.75rem;" title="Import siswa khusus ke ${escapeHtml(c.name)}">📥 Import</a>
              <button class="button danger btn-delete-class" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-count="${c.student_count}" style="padding:0.2rem 0.5rem;font-size:0.75rem;">Hapus</button>
            </div>
          </td>
        </tr>`;
      }).join("");

      const tableContent = sortedClasses.length
        ? `${allClassesHeader}<div class="table-wrap"><table><thead><tr><th>Nama Kelas</th><th>Siswa</th><th>Aksi</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
        : emptyState("Belum ada", "Tambahkan kelas.");

      document.querySelector("#classes-data")!.innerHTML = tableContent;

      // Click listener for "Semua Siswa" header button
      document.getElementById("btn-all-classes")?.addEventListener("click", () => {
        selectedClassId = null;
        updateFilterIndicator(null);
        void loadClasses();
        void loadStudents(currentSearch);
      });

      // Click listener for class rows
      document.querySelectorAll<HTMLTableRowElement>(".class-row").forEach(row => {
        row.onclick = (e) => {
          if ((e.target as HTMLElement).closest(".btn-delete-class") || (e.target as HTMLElement).closest(".btn-import-class")) return;
          const classId = row.dataset.classId!;
          const className = row.dataset.className!;
          if (selectedClassId === classId) {
            selectedClassId = null;
            updateFilterIndicator(null);
          } else {
            selectedClassId = classId;
            updateFilterIndicator(className);
          }
          void loadClasses();
          void loadStudents(currentSearch);
        };
      });

      document.querySelectorAll<HTMLButtonElement>(".btn-delete-class").forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id!;
          const name = btn.dataset.name!;
          const count = Number(btn.dataset.count);
          if (count > 0) {
            toastError(`Kelas "${name}" masih berisi ${count} siswa. Pindahkan siswa terlebih dahulu sebelum menghapus.`);
            return;
          }
          if (!confirm(`Apakah Anda yakin ingin menghapus kelas "${name}"?`)) return;
          const row = btn.closest("tr");
          const reinsertRow = row ? removeRowOptimistic(row as HTMLTableRowElement) : () => {};
          if (selectedClassId === id) selectedClassId = null;
          await optimistic({
            apply: () => {},
            mutation: () => api(`/classes/${id}`, { method: "DELETE" }),
            rollback: () => { reinsertRow(); },
            revalidate: async () => { await loadClasses(); await loadStudents(currentSearch); },
            successMessage: `Kelas "${name}" berhasil dihapus.`,
            errorPrefix: "Gagal menghapus kelas"
          });
        };
      });
    } catch (err) {
      document.querySelector("#classes-data")!.innerHTML = errorState(err);
    }
  };

  const updateFilterIndicator = (className: string | null) => {
    const indicator = document.getElementById("active-filter-indicator");
    const nameEl = document.getElementById("filter-class-name");
    if (!indicator || !nameEl) return;
    if (className) {
      nameEl.textContent = className;
      indicator.style.display = "flex";
    } else {
      indicator.style.display = "none";
    }
  };

  document.getElementById("btn-clear-filter")?.addEventListener("click", () => {
    selectedClassId = null;
    updateFilterIndicator(null);
    void loadClasses();
    void loadStudents(currentSearch);
  });

  const addClassModal = document.getElementById("add-class-modal") as HTMLDivElement;
  const addClassForm = document.getElementById("add-class-form") as HTMLFormElement;
  const levelSelect = document.getElementById("add-class-level") as HTMLSelectElement;
  const parallelInput = document.getElementById("add-class-parallel") as HTMLInputElement;

  document.getElementById("btn-add-class")?.addEventListener("click", () => {
    addClassModal.style.display = "flex";
  });
  const closeAddClass = () => { addClassModal.style.display = "none"; };
  document.getElementById("close-add-class-modal")?.addEventListener("click", closeAddClass);

  addClassForm.onsubmit = async (e) => {
    e.preventDefault();
    const level = levelSelect.value;
    const parallels = parallelInput.value.split(",").map(s => s.trim()).filter(Boolean);
    const classNamesToCreate = parallels.length > 0 
      ? parallels.map(p => `${level} ${p}`)
      : [level];

    closeAddClass();

    // Optimistically insert new class rows into table
    const tbody = document.querySelector("#classes-data tbody");
    const insertedRows: HTMLTableRowElement[] = [];
    if (tbody) {
      for (const className of classNamesToCreate) {
        const tr = document.createElement("tr");
        tr.className = "row-inserting";
        tr.innerHTML = `<td><strong>${escapeHtml(className)}</strong></td><td>0 siswa</td><td><button class="button danger btn-delete-class" style="padding:0.2rem 0.5rem;font-size:0.75rem;" disabled>Hapus</button></td>`;
        tbody.appendChild(tr);
        insertedRows.push(tr);
      }
    }

    await optimistic({
      apply: () => {},
      mutation: async () => {
        const years = await api<AcademicYear[]>("/academic-years");
        const activeYear = years.data.find(y => y.is_active) ?? years.data[0];
        if (!activeYear) throw new Error("Belum ada Tahun Ajaran aktif.");

        for (const className of classNamesToCreate) {
          const code = className.toLowerCase().replace(/\s+/g, "-");
          await api("/classes", {
            method: "POST",
            body: JSON.stringify({ name: className, code, academic_year_id: activeYear.id })
          });
        }
      },
      rollback: () => {
        insertedRows.forEach(r => r.remove());
      },
      revalidate: () => loadClasses(),
      successMessage: `Berhasil menambahkan ${classNamesToCreate.length} kelas.`,
      errorPrefix: "Gagal menambah kelas"
    });
    addClassForm.reset();
  };

  const modal = document.getElementById("student-modal") as HTMLDivElement;
  const closeModal = () => { modal.style.display = "none"; };
  document.getElementById("close-student-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-student")?.addEventListener("click", closeModal);

  const editForm = document.getElementById("student-edit-form") as HTMLFormElement;
  editForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = (document.getElementById("edit-student-id") as HTMLInputElement).value;
    const saveBtn = document.getElementById("btn-save-student") as HTMLButtonElement;
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan...";

    const full_name = (document.getElementById("edit-full-name") as HTMLInputElement).value.trim();
    const nisn = (document.getElementById("edit-nisn") as HTMLInputElement).value.trim() || null;
    const pob = (document.getElementById("edit-pob") as HTMLInputElement).value.trim() || null;
    const date_of_birth = (document.getElementById("edit-dob") as HTMLInputElement).value || null;
    const address = (document.getElementById("edit-address") as HTMLInputElement).value.trim() || null;
    const gender = (document.getElementById("edit-gender") as HTMLSelectElement).value;
    const is_active = (document.getElementById("edit-status") as HTMLSelectElement).value === "true";

    // Close modal immediately for optimistic UX
    closeModal();

    // Find the student row and update cells optimistically
    const targetRow = document.querySelector(`[data-student]`);
    const prevHtml = targetRow?.closest("tbody")?.innerHTML;

    await optimistic({
      apply: () => {
        // Update the row in place if found
        const allRows = document.querySelectorAll<HTMLTableRowElement>("#table-data tbody tr");
        for (const row of allRows) {
          const editBtn = row.querySelector<HTMLButtonElement>(".btn-edit-student");
          if (!editBtn) continue;
          try {
            const data = JSON.parse(editBtn.dataset.student!);
            if (data.id === id) {
              const cells = row.querySelectorAll("td");
              if (cells[1]) cells[1].innerHTML = `<strong>${escapeHtml(full_name)}</strong>`;
              if (cells[2]) cells[2].textContent = nisn ?? "—";
              break;
            }
          } catch {}
        }
      },
      mutation: () => api(`/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name, nisn, pob, date_of_birth, address, gender, is_active })
      }),
      rollback: () => {
        if (prevHtml) {
          const tbody = document.querySelector("#table-data tbody");
          if (tbody) tbody.innerHTML = prevHtml;
        }
      },
      revalidate: () => loadStudents(currentSearch),
      successMessage: `Data siswa ${full_name} berhasil diperbarui.`,
      errorPrefix: "Gagal memperbarui data siswa"
    });

    saveBtn.disabled = false;
    saveBtn.textContent = "Simpan Perubahan";
  };

  const loadStudents = async (search = "") => {
    currentSearch = search;
    try {
      let queryUrl = `/students?page=1&page_size=50`;
      if (selectedClassId) queryUrl += `&class_id=${encodeURIComponent(selectedClassId)}`;
      if (search) queryUrl += `&search=${encodeURIComponent(search)}`;

      const response = await api<(Student & { class_name?: string; pob?: string; address?: string; photo_url?: string | null })[]>(queryUrl);
      
      // UI table matched with Template_dapodik_aksis: Foto, Nama Lengkap, NISN, Kelas, Tempat / Tgl Lahir, Alamat, Gender, Status, Aksi
      document.querySelector("#table-data")!.innerHTML = response.data.length
        ? `<div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:60px;text-align:center;">Foto</th>
                  <th>Nama Lengkap</th>
                  <th>NISN</th>
                  <th>Kelas</th>
                  <th>Tempat / Tgl Lahir</th>
                  <th>Alamat</th>
                  <th>Gender</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${response.data.map(item => {
                  const hasPhoto = Boolean(item.photo_url && String(item.photo_url).trim().length > 5);
                  const initials = (item.full_name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                  const photoCell = hasPhoto
                    ? `<img src="${escapeHtml(item.photo_url!)}" alt="${escapeHtml(item.full_name)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;" />`
                    : `<div style="width:40px;height:40px;border-radius:50%;background:#fef3c7;color:#b45309;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;border:2px dashed #fbbf24;" title="Foto belum diunggah orang tua">${initials}</div>`;
                  return `
                  <tr>
                    <td style="text-align:center;">${photoCell}</td>
                    <td><strong>${escapeHtml(item.full_name)}</strong></td>
                    <td>${escapeHtml(item.nisn ?? "—")}</td>
                    <td><span class="status neutral" style="font-weight:600;">${escapeHtml(item.class_name ?? "—")}</span></td>
                    <td>${escapeHtml(item.pob || "—")}, ${escapeHtml(item.date_of_birth ?? "—")}</td>
                    <td>${escapeHtml(item.address || "—")}</td>
                    <td>${item.gender === 'MALE' ? 'L' : item.gender === 'FEMALE' ? 'P' : escapeHtml(item.gender ?? '—')}</td>
                    <td>
                      <span class="status ${item.is_active ? "success" : "neutral"}">${item.is_active ? "Aktif" : "Nonaktif"}</span>
                      ${!item.is_active ? '' : hasPhoto ? '<span class="status success" style="margin-top:2px;font-size:0.68rem;padding:2px 6px;display:inline-block;">Siap Cetak ✓</span>' : '<span class="status warning" style="margin-top:2px;font-size:0.68rem;padding:2px 6px;display:inline-block;background:#fef3c7;color:#b45309;" title="Ingatkan orang tua untuk unggah foto via PWA Orang Tua">Butuh Foto ⚠️</span>'}
                    </td>
                    <td>
                      <div style="display:flex;gap:4px;">
                        <button class="button secondary btn-edit-student" data-student='${JSON.stringify(item).replace(/'/g, "&#39;")}' style="padding:0.2rem 0.5rem;font-size:0.75rem;">Edit</button>
                        <button class="button danger btn-delete-student" data-id="${item.id}" data-name="${escapeHtml(item.full_name)}" style="padding:0.2rem 0.5rem;font-size:0.75rem;">Hapus</button>
                      </div>
                    </td>
                  </tr>
                `;}).join("")}
              </tbody>
            </table>
          </div>
          <div class="table-footer">Menampilkan ${response.data.length} dari ${response.meta?.total ?? response.data.length} data</div>`
        : emptyState("Data belum tersedia", selectedClassId ? "Tidak ada siswa dalam kelas ini." : "Tambahkan data siswa pertama.");

      document.querySelectorAll<HTMLButtonElement>(".btn-edit-student").forEach(btn => {
        btn.onclick = () => {
          const item = JSON.parse(btn.dataset.student!);
          (document.getElementById("edit-student-id") as HTMLInputElement).value = item.id;
          (document.getElementById("edit-full-name") as HTMLInputElement).value = item.full_name || "";
          (document.getElementById("edit-nisn") as HTMLInputElement).value = item.nisn || "";
          (document.getElementById("edit-pob") as HTMLInputElement).value = item.pob || "";
          (document.getElementById("edit-dob") as HTMLInputElement).value = item.date_of_birth || "";
          (document.getElementById("edit-address") as HTMLInputElement).value = item.address || "";
          (document.getElementById("edit-gender") as HTMLSelectElement).value = item.gender || "MALE";
          (document.getElementById("edit-status") as HTMLSelectElement).value = item.is_active !== false ? "true" : "false";
          modal.style.display = "flex";
        };
      });

      document.querySelectorAll<HTMLButtonElement>(".btn-delete-student").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id!;
          const name = btn.dataset.name!;
          if (!confirm(`Apakah Anda yakin ingin menghapus data siswa "${name}"?`)) return;
          const row = btn.closest("tr") as HTMLTableRowElement | null;
          const reinsertRow = row ? removeRowOptimistic(row) : () => {};
          await optimistic({
            apply: () => {},
            mutation: () => api(`/students/${id}`, { method: "DELETE" }),
            rollback: () => { reinsertRow(); },
            revalidate: async () => { await loadStudents(currentSearch); await loadClasses(); },
            successMessage: `Data siswa "${name}" berhasil dihapus.`,
            errorPrefix: "Gagal menghapus siswa"
          });
        };
      });
    } catch (error) { document.querySelector("#table-data")!.innerHTML = errorState(error); }
  };

  let timer = 0;
  document.querySelector<HTMLInputElement>("#table-search")?.addEventListener("input", (event) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void loadStudents((event.target as HTMLInputElement).value), 300);
  });
  
  const principalForm = document.getElementById("principal-form") as HTMLFormElement;
  const principalNameInput = document.getElementById("principal-name") as HTMLInputElement;
  const principalNipInput = document.getElementById("principal-nip") as HTMLInputElement | null;
  const logoFileInput = document.getElementById("school-logo-file") as HTMLInputElement;
  const logoPreview = document.getElementById("logo-preview") as HTMLImageElement;
  const logoBase64 = document.getElementById("school-logo-base64") as HTMLInputElement;
  const signatureFileInput = document.getElementById("principal-signature-file") as HTMLInputElement;
  const signaturePreview = document.getElementById("signature-preview") as HTMLImageElement;
  const signatureBase64 = document.getElementById("principal-signature-base64") as HTMLInputElement;
  const cancelBtn = document.getElementById("btn-cancel-principal") as HTMLButtonElement | null;
  const saveBtn = document.getElementById("btn-save-principal") as HTMLButtonElement | null;

  let lastSavedName = "";
  let lastSavedNip = "";
  let lastSavedLogo = "";
  let lastSavedSig = "";

  const updateSaveButtonState = () => {
    if (!saveBtn || !principalNameInput || !signatureBase64) return;
    const currentName = principalNameInput.value.trim();
    const currentNip = principalNipInput ? principalNipInput.value.trim() : "";
    const currentLogo = logoBase64 ? logoBase64.value.trim() : "";
    const currentSig = signatureBase64.value.trim();
    const isDirty = (currentName !== lastSavedName) || (currentNip !== lastSavedNip) || (currentLogo !== lastSavedLogo) || (currentSig !== lastSavedSig);

    if (isDirty) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan Perubahan";
      saveBtn.style.opacity = "1";
      saveBtn.style.cursor = "pointer";
      if (cancelBtn) cancelBtn.style.display = "inline-block";
    } else {
      saveBtn.disabled = true;
      saveBtn.textContent = "Tersimpan ✓";
      saveBtn.style.opacity = "0.75";
      saveBtn.style.cursor = "default";
      if (cancelBtn) cancelBtn.style.display = "none";
    }
  };

  cancelBtn?.addEventListener("click", () => {
    principalNameInput.value = lastSavedName;
    if (principalNipInput) principalNipInput.value = lastSavedNip;
    if (logoBase64) logoBase64.value = lastSavedLogo;
    signatureBase64.value = lastSavedSig;
    if (logoFileInput) logoFileInput.value = "";
    signatureFileInput.value = "";

    if (lastSavedLogo) {
      logoPreview.src = lastSavedLogo;
      logoPreview.style.display = "block";
    } else {
      logoPreview.src = "";
      logoPreview.style.display = "none";
    }

    if (lastSavedSig) {
      signaturePreview.src = lastSavedSig;
      signaturePreview.style.display = "block";
    } else {
      signaturePreview.src = "";
      signaturePreview.style.display = "none";
    }
    updateSaveButtonState();
  });

  principalNameInput?.addEventListener("input", updateSaveButtonState);
  principalNipInput?.addEventListener("input", updateSaveButtonState);

  const removeBgCheckbox = document.getElementById("school-logo-remove-bg") as HTMLInputElement | null;
  let rawLogoImage: HTMLImageElement | null = null;

  const processAndSetLogo = () => {
    if (!rawLogoImage) return;
    const removeBg = removeBgCheckbox ? removeBgCheckbox.checked : true;
    const canvas = document.createElement('canvas');
    const MAX_WIDTH = 400;
    let width = rawLogoImage.width;
    let height = rawLogoImage.height;
    if (width > MAX_WIDTH) {
      height = Math.round(height * (MAX_WIDTH / width));
      width = MAX_WIDTH;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(rawLogoImage, 0, 0, width, height);

    if (removeBg) {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // Sample perimeter & corner pixels to detect dominant background color
      const samplePoints = [
        [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
        [Math.floor(width / 2), 0], [0, Math.floor(height / 2)],
        [width - 1, Math.floor(height / 2)], [Math.floor(width / 2), height - 1]
      ];

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (const pt of samplePoints) {
        const x = pt[0]!, y = pt[1]!;
        const idx = (y * width + x) * 4;
        const a = data[idx + 3]!;
        if (a > 10) {
          rSum += data[idx]!;
          gSum += data[idx + 1]!;
          bSum += data[idx + 2]!;
          count++;
        }
      }

      if (count > 0) {
        const bgR = rSum / count;
        const bgG = gSum / count;
        const bgB = bSum / count;

        const maxDistance = 45;
        const fadeDistance = 75;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          const a = data[i + 3]!;

          if (a < 10) continue;

          const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

          if (dist <= maxDistance) {
            data[i + 3] = 0;
          } else if (dist < fadeDistance) {
            const factor = (dist - maxDistance) / (fadeDistance - maxDistance);
            data[i + 3] = Math.round(a * factor);
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }

    const pngBase64 = canvas.toDataURL('image/png');
    logoPreview.src = pngBase64;
    logoPreview.style.display = 'block';
    logoBase64.value = pngBase64;
    updateSaveButtonState();
  };

  removeBgCheckbox?.addEventListener("change", processAndSetLogo);

  if (logoFileInput) {
    logoFileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 2.5 * 1024 * 1024) {
        toastError(`Ukuran logo (${(file.size / 1024 / 1024).toFixed(1)} MB) terlalu besar. Batas maksimal 2.5 MB.`);
        logoFileInput.value = "";
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        rawLogoImage = img;
        processAndSetLogo();
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
  }
  
  signatureFileInput.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 400;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 180 && data[i+1]! > 180 && data[i+2]! > 180) data[i+3] = 0;
        else { data[i] = 15; data[i+1] = 23; data[i+2] = 42; } // Make ink dark slate
      }
      ctx.putImageData(imgData, 0, 0);
      const pngBase64 = canvas.toDataURL('image/png');
      signaturePreview.src = pngBase64;
      signaturePreview.style.display = 'block';
      signatureBase64.value = pngBase64;
      URL.revokeObjectURL(url);
      updateSaveButtonState();
    };
    img.src = url;
  };

  api<any>("/schools/current").then(res => {
    if (res.data) {
      lastSavedName = (res.data.principal_name || "").trim();
      lastSavedNip = (res.data.principal_nip || "").trim();
      lastSavedLogo = (res.data.logo_url || "").trim();
      lastSavedSig = (res.data.principal_signature_url || "").trim();
      principalNameInput.value = res.data.principal_name || "";
      if (principalNipInput) principalNipInput.value = res.data.principal_nip || "";
      
      if (res.data.logo_url) {
        logoPreview.src = res.data.logo_url;
        logoPreview.style.display = 'block';
        if (logoBase64) logoBase64.value = res.data.logo_url;
      }
      if (res.data.principal_signature_url) {
        signaturePreview.src = res.data.principal_signature_url;
        signaturePreview.style.display = 'block';
        signatureBase64.value = res.data.principal_signature_url;
      }
      updateLevelDropdown(res.data);
      updateSaveButtonState();
    }
  }).catch(() => {});
  
  principalForm.onsubmit = async (e) => {
    e.preventDefault();
    const prevName = principalNameInput.value;
    const prevNip = principalNipInput ? principalNipInput.value : "";
    const prevLogo = logoBase64 ? logoBase64.value : "";
    const prevSig = signatureBase64.value;
    const newName = principalNameInput.value.trim() || null;
    const newNip = principalNipInput ? (principalNipInput.value.trim() || null) : null;
    const newLogo = logoBase64 ? (logoBase64.value.trim() || null) : null;
    const newSig = signatureBase64.value.trim() || null;

    await optimistic({
      apply: () => {
        lastSavedName = (newName || "").trim();
        lastSavedNip = (newNip || "").trim();
        lastSavedLogo = (newLogo || "").trim();
        lastSavedSig = (newSig || "").trim();
        updateSaveButtonState();
      },
      mutation: () => api("/schools/current", {
        method: "PATCH",
        body: JSON.stringify({
          principal_name: newName,
          principal_nip: newNip,
          logo_url: newLogo,
          principal_signature_url: newSig
        })
      }),
      rollback: () => {
        principalNameInput.value = prevName;
        if (principalNipInput) principalNipInput.value = prevNip;
        if (logoBase64) logoBase64.value = prevLogo;
        signatureBase64.value = prevSig;
        lastSavedName = (prevName || "").trim();
        lastSavedNip = (prevNip || "").trim();
        lastSavedLogo = (prevLogo || "").trim();
        lastSavedSig = (prevSig || "").trim();
        updateSaveButtonState();
      },
      successMessage: "Profil & Data Sekolah berhasil disimpan.",
      errorPrefix: "Gagal menyimpan data sekolah"
    });
  };

  await Promise.all([loadClasses(), loadStudents()]);
}

async function academicYearsPage(): Promise<void> {
  shell(`<section class="stats-grid">${Array.from({ length: 1 }, () => skeleton(1)).join("")}</section>`, "Tahun Ajaran", "Kelola tahun ajaran dan periode aktif.");
  try {
    const res = await api<AcademicYear[]>("/academic-years");
    const data = res.data ?? [];
    const activeYear = data.find(y => y.is_active);

    const rows = data.map(item => `<tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${escapeHtml(item.start_date)} — ${escapeHtml(item.end_date)}</td>
      <td>
        ${item.is_active
        ? `<span class="status success">Aktif berjalan</span>`
        : `<button class="button secondary btn-switch-year" data-id="${item.id}" style="padding:0.3rem 0.6rem;font-size:0.75rem;">Jadikan Aktif</button>`}
      </td>
    </tr>`).join("");

    shell(`<section class="stats-grid">
      <article class="stat-card lime"><div><span>Tahun Ajaran Aktif</span><strong>${activeYear ? escapeHtml(activeYear.name) : "Tidak ada"}</strong></div><span class="trend">📅</span></article>
    </section>
    <section class="dashboard-grid" style="grid-template-columns: 1fr;">
      <article class="panel">
        <div class="panel-head">
          <div><h2>Daftar Tahun Ajaran</h2><p>Hanya satu periode yang dapat aktif pada satu waktu.</p></div>
          <button id="btn-add-year" class="button primary">+ Tambah Tahun Ajaran</button>
        </div>
        ${rows ? `<div class="table-wrap"><table><thead><tr><th>Tahun Ajaran</th><th>Periode</th><th>Status / Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState("Belum ada data", "Tambahkan tahun ajaran pertama.")}
      </article>
    </section>
    
    <div id="year-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;overflow-y:auto;padding:2rem;">
      <div style="background:var(--bg);max-width:500px;margin:auto;border-radius:1rem;padding:2rem;position:relative;">
        <button id="close-year-modal" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text);">&times;</button>
        <h2>Tambah Tahun Ajaran</h2>
        <p style="margin-bottom:1.5rem;color:var(--text-light);">Tahun ajaran baru akan disimpan dalam keadaan nonaktif.</p>
        <form id="year-form" class="login-form" style="margin:0;">
          <div id="year-error" style="display:none;background:var(--red);color:white;padding:0.75rem;border-radius:0.5rem;font-size:0.875rem;margin-bottom:1rem;"></div>
          
          <label>Nama Tahun Ajaran<input id="year-name" type="text" placeholder="Cth: 2026/2027" required maxlength="32" /></label>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <label>Tanggal Mulai<input id="year-start" type="date" required /></label>
            <label>Tanggal Selesai<input id="year-end" type="date" required /></label>
          </div>
          
          <button id="year-submit" class="button primary" type="submit" style="margin-top:1rem;">Simpan</button>
        </form>
      </div>
    </div>`, "Tahun Ajaran", "Kelola tahun ajaran dan periode aktif.");

    setTimeout(() => {
      const modal = document.getElementById("year-modal") as HTMLDivElement;
      document.getElementById("btn-add-year")?.addEventListener("click", () => modal.style.display = "flex");
      document.getElementById("close-year-modal")?.addEventListener("click", () => modal.style.display = "none");

      const form = document.getElementById("year-form") as HTMLFormElement;
      const errorDiv = document.getElementById("year-error") as HTMLDivElement;
      const submitBtn = document.getElementById("year-submit") as HTMLButtonElement;
      const nameInput = document.getElementById("year-name") as HTMLInputElement;
      const startInput = document.getElementById("year-start") as HTMLInputElement;
      const endInput = document.getElementById("year-end") as HTMLInputElement;

      nameInput?.addEventListener("input", () => {
        const val = nameInput.value.trim();
        const match = val.match(/^.*?(\d{4})(?:[\/\-\s]+(\d{2,4}))?/);
        if (match && match[1]) {
          const startY = parseInt(match[1], 10);
          let endY = startY + 1;
          if (match[2]) {
            const parsedEnd = parseInt(match[2], 10);
            if (match[2].length === 2) {
              const prefix = Math.floor(startY / 100);
              endY = prefix * 100 + parsedEnd;
            } else if (match[2].length === 4) {
              endY = parsedEnd;
            }
          }
          if (startY >= 1990 && startY <= 2100 && endY >= startY) {
            startInput.value = `${startY}-07-01`;
            endInput.value = `${endY}-06-30`;
          }
        }
      });

      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorDiv.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.textContent = "Menyimpan...";

        try {
          const name = (document.getElementById("year-name") as HTMLInputElement).value.trim();
          const start_date = (document.getElementById("year-start") as HTMLInputElement).value;
          const end_date = (document.getElementById("year-end") as HTMLInputElement).value;

          await api("/academic-years", {
            method: "POST",
            body: JSON.stringify({ name, start_date, end_date })
          });

          // Optimistic: close modal, show toast, then re-render
          modal.style.display = "none";
          toastSuccess(`Tahun ajaran "${name}" berhasil ditambahkan.`);
          // Append row optimistically to the table
          const tbody = document.querySelector("article.panel tbody");
          if (tbody) {
            const newRow = document.createElement("tr");
            newRow.className = "row-inserting";
            newRow.innerHTML = `<td><strong>${escapeHtml(name)}</strong></td><td>${escapeHtml(start_date)} — ${escapeHtml(end_date)}</td><td><span class="status neutral">Nonaktif (Baru)</span></td>`;
            tbody.appendChild(newRow);
          }
          // Silently re-render full page after 500ms
          setTimeout(() => void render(), 500);
        } catch (err: any) {
          errorDiv.textContent = err.message || "Gagal menyimpan.";
          errorDiv.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "Simpan";
        }
      });

      document.querySelectorAll(".btn-switch-year").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          const target = e.target as HTMLButtonElement;
          const id = target.getAttribute("data-id");
          if (!id || !confirm("Jadikan tahun ajaran ini sebagai periode aktif berjalan?")) return;

          const row = target.closest("tr");
          const prevButtons = document.querySelectorAll<HTMLElement>(".btn-switch-year");
          const prevActiveLabel = document.querySelector(".status.success");

          // Optimistic: immediately swap the UI
          target.outerHTML = `<span class="status success">Aktif berjalan</span>`;
          // Remove "Aktif berjalan" badge from previous active row
          if (prevActiveLabel && prevActiveLabel.closest("tr") !== row) {
            prevActiveLabel.outerHTML = `<button class="button secondary btn-switch-year" style="padding:0.3rem 0.6rem;font-size:0.75rem;">Jadikan Aktif</button>`;
          }

          await optimistic({
            apply: () => {},
            mutation: () => api("/academic-years/switch", {
              method: "POST",
              body: JSON.stringify({ academic_year_id: id })
            }),
            rollback: () => void render(),
            revalidate: () => void render(),
            successMessage: "Tahun ajaran aktif berhasil diubah.",
            errorPrefix: "Gagal mengaktifkan tahun ajaran"
          });
        });
      });
    }, 100);
  } catch (error) { shell(errorState(error), "Tahun Ajaran", "Kelola tahun ajaran dan periode aktif."); }
}
async function cardsPage(): Promise<void> {
  shell(`<section class="stats-grid">${Array.from({ length: 3 }, () => skeleton(1)).join("")}</section>`, "Kartu Siswa", "Pantau identitas kartu fisik (NFC) dan status lifecycle-nya.");
  try {
    const { data: summary } = await api<{ active: number, pending: number, blocked: number, missing_photo?: number }>("/cards/summary");
    const missingPhoto = summary.missing_photo ?? 0;

    shell(`<section class="stats-grid" style="grid-template-columns: repeat(4, 1fr);">
      <article class="stat-card sage">
        <div class="stat-card-head">
          <div>
            <div class="stat-card-title">Aktif & Terverifikasi</div>
            <span class="stat-card-subtitle">Siap digunakan (NFC)</span>
          </div>
          <span class="trend">💳</span>
        </div>
        <strong>${summary.active} <small style="display:inline;font-size:0.85rem;font-weight:600;opacity:0.8;">Kartu</small></strong>
      </article>

      <article class="stat-card ${summary.pending > 0 ? 'lime' : 'neutral'}">
        <div class="stat-card-head">
          <div>
            <div class="stat-card-title">Tahap Produksi</div>
            <span class="stat-card-subtitle">(Menunggu Encoding)</span>
          </div>
          <span class="trend">⏳</span>
        </div>
        <strong>${summary.pending} <small style="display:inline;font-size:0.85rem;font-weight:600;opacity:0.8;">Kartu</small></strong>
      </article>

      <article class="stat-card ${missingPhoto > 0 ? 'sand' : 'neutral'}">
        <div class="stat-card-head">
          <div>
            <div class="stat-card-title">Butuh Foto</div>
            <span class="stat-card-subtitle">(Belum Siap Cetak)</span>
          </div>
          <span class="trend">⚠️</span>
        </div>
        <strong>${missingPhoto} <small style="display:inline;font-size:0.85rem;font-weight:600;opacity:0.8;">Siswa</small></strong>
      </article>

      <article class="stat-card ${summary.blocked > 0 ? 'red' : 'neutral'}">
        <div class="stat-card-head">
          <div>
            <div class="stat-card-title">Kartu Diblokir</div>
            <span class="stat-card-subtitle">(Hilang / Rusak)</span>
          </div>
          <span class="trend">🚫</span>
        </div>
        <strong>${summary.blocked} <small style="display:inline;font-size:0.85rem;font-weight:600;opacity:0.8;">Kartu</small></strong>
      </article>
    </section>
    
    ${missingPhoto > 0 ? `<div style="margin: 1rem 0; padding: 0.85rem 1.25rem; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 0.75rem; font-size: 0.85rem; color: #92400e; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span style="font-size: 1.2rem;">📸</span>
        <div><strong>Perhatian Foto Siswa Belum Lengkap:</strong> Terdapat <strong>${missingPhoto} siswa</strong> yang belum memiliki foto resmi. Kartu siswa baru bisa masuk antrean cetak Super Admin setelah foto diunggah via PWA Orang Tua.</div>
      </div>
      <a href="/students" class="button secondary" style="white-space:nowrap;padding:0.4rem 0.8rem;font-size:0.75rem;">Lihat Daftar Siswa &rarr;</a>
    </div>` : ''}

    <div style="margin: 1rem 0; padding: 0.85rem 1.25rem; background: var(--accent-light, rgba(59,130,246,0.1)); border: 1px solid var(--line); border-radius: 0.75rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.75rem;">
      <span style="font-size: 1.2rem;">ℹ️</span>
      <div>
        <strong>Aturan Status Kartu:</strong> Status <code>ACTIVE</code> (Aktif) hanya terpasang secara otomatis ketika kartu fisik telah dicetak dan chip NFC di dalamnya disuntik & terverifikasi oleh Super Admin via Card Station. Admin Sekolah dapat mengubah status ke <code>BLOCKED</code> atau <code>LOST</code> bila kartu hilang/rusak.
      </div>
    </div>

    <section class="dashboard-grid" style="grid-template-columns: 1fr;">
      <article class="panel">
        <div class="panel-head"><h2>Daftar Kartu Terdaftar</h2><p>Identitas UID dan Serial NFC</p></div>
        <div id="cards-data">${skeleton(6)}</div>
      </article>
    </section>`, "Kartu Siswa", "Pantau identitas kartu fisik (NFC) dan status lifecycle-nya.");

    let page = 1;
    const loadCards = async () => {
      try {
        const response = await api<(Card & { production_status?: string })[]>(`/cards?page=${page}&page_size=50`);
        const cards = response.data;
        const cardRows = cards.map(item => {
          const student = relation(item.students) as any;
          const studentHtml = student ? `<strong>${escapeHtml(student.full_name)}</strong><small>${escapeHtml(student.student_number)}</small>` : `<strong style="color:var(--muted)">Belum terhubung</strong>`;
          
          const prodStatus = item.production_status || 'LEGACY';
          let prodBadge = '';
          if (prodStatus === 'VERIFIED') prodBadge = `<span class="status success">✅ Verified (Chip Disuntik)</span>`;
          else if (prodStatus === 'LEGACY') prodBadge = `<span class="status neutral" style="background:#e0f2fe;color:#0369a1;">Legacy (Pra-Sistem)</span>`;
          else if (prodStatus === 'DRAFT') prodBadge = `<span class="status warning">Draft Batch</span>`;
          else if (prodStatus === 'PRINTED') prodBadge = `<span class="status warning">Cetak Fisik</span>`;
          else if (prodStatus === 'READY_TO_WRITE' || prodStatus === 'WRITING') prodBadge = `<span class="status warning">Siap Suntik Chip</span>`;
          else if (prodStatus === 'FAILED') prodBadge = `<span class="status error">Gagal Chip</span>`;
          else if (prodStatus === 'CANCELLED') prodBadge = `<span class="status neutral">Dibatalkan</span>`;
          else prodBadge = `<span class="status neutral">${escapeHtml(prodStatus)}</span>`;

          const uidDisplay = item.card_uid ? `<code>${escapeHtml(item.card_uid)}</code>` : `<span style="color:var(--text-light); font-size:0.75rem; font-style:italic;">Belum disuntik chip</span>`;

          return `<tr>
            <td>${studentHtml}</td>
            <td><strong>${escapeHtml(item.card_serial)}</strong><br/>${uidDisplay}</td>
            <td>${prodBadge}</td>
            <td><span class="status ${item.status === "ACTIVE" ? "success" : "warning"}">${escapeHtml(item.status)}</span></td>
            <td>${escapeHtml(item.expires_at ? new Date(item.expires_at).toLocaleDateString("id-ID") : "—")}</td>
            <td><button class="button secondary" data-action="status" data-id="${item.id}" style="padding:0.3rem 0.6rem;font-size:0.75rem;">Status</button></td>
          </tr>`;
        }).join("");

        const total = response.meta?.total ?? 0;
        document.querySelector("#cards-data")!.innerHTML = cards.length
          ? `<div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Siswa Pemilik</th>
                    <th>Serial & UID Chip</th>
                    <th>Status Produksi (Chip)</th>
                    <th>Status Kartu</th>
                    <th>Kedaluwarsa</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>${cardRows}</tbody>
              </table>
            </div>
             <div class="table-footer" style="display:flex;justify-content:space-between;align-items:center;">
               <button class="button secondary" id="cards-prev" ${page === 1 ? "disabled" : ""}>Sebelumnya</button>
               <span>Menampilkan Halaman ${page} dari ${Math.ceil(total/50) || 1} (${total} data)</span>
               <button class="button secondary" id="cards-next" ${page * 50 >= total ? "disabled" : ""}>Berikutnya</button>
             </div>`
          : emptyState("Data belum tersedia", "Belum ada kartu terdaftar.");

        document.querySelector("#cards-prev")?.addEventListener("click", () => { page--; void loadCards(); });
        document.querySelector("#cards-next")?.addEventListener("click", () => { page++; void loadCards(); });

        document.querySelectorAll<HTMLButtonElement>("[data-action='status']").forEach(btn => btn.addEventListener("click", async (e) => {
          const id = (e.currentTarget as HTMLButtonElement).dataset.id!;
          const current = cards.find(c => c.id === id);
          if(!current) return;
          const newStatus = prompt("Masukkan status baru (BLOCKED, LOST, EXPIRED):\nCatatan: Status ACTIVE hanya diaktifkan otomatis oleh Super Admin setelah chip disuntik via Card Station.\nPerhatian: Mengubah status ke LOST/BLOCKED akan menonaktifkan kartu.", current.status);
          if(newStatus && ["ACTIVE", "LOST", "BLOCKED", "EXPIRED"].includes(newStatus) && newStatus !== current.status) {
            if (newStatus === "ACTIVE" && (current as any).production_status !== "VERIFIED" && (current as any).production_status !== "LEGACY") {
              toastError(`Kartu belum disuntik chip NFC oleh Super Admin (Status Produksi: ${(current as any).production_status || 'DRAFT'}). Kartu fisik harus dicetak dan disuntik chip terlebih dahulu.`);
              return;
            }
            const reason = prompt("Alasan perubahan status:") || "Diperbarui admin sekolah";
            const row = btn.closest("tr");
            const statusCell = row?.querySelectorAll("td")[3];
            const prevStatusHtml = statusCell?.innerHTML ?? "";

            await optimistic({
              apply: () => {
                if (statusCell) statusCell.innerHTML = `<span class="status ${newStatus === 'ACTIVE' ? 'success' : 'warning'}">${escapeHtml(newStatus)}</span>`;
                btn.disabled = true;
              },
              mutation: () => api(`/cards/${id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus, reason }) }),
              rollback: () => {
                if (statusCell) statusCell.innerHTML = prevStatusHtml;
                btn.disabled = false;
              },
              revalidate: () => loadCards(),
              successMessage: `Status kartu berhasil diubah ke ${newStatus}.`,
              errorPrefix: "Gagal mengubah status kartu"
            });
          }
        }));
      } catch (err) { document.querySelector("#cards-data")!.innerHTML = errorState(err); }
    };
    
    void loadCards();
  } catch (error) { shell(errorState(error), "Kartu Siswa", "Pantau identitas kartu fisik (NFC) dan status lifecycle-nya."); }
}
async function devicesPage(): Promise<void> {
  shell(`<section class="stats-grid">${Array.from({ length: 3 }, () => skeleton(1)).join("")}</section>`, "Perangkat", "Status IoT gate, terminal, LED, dan card station sekolah.");
  try {
    const [summaryRes, devicesRes] = await Promise.all([
      api<{ total: number, active: number, maintenance: number, inactive: number }>("/devices/summary"),
      api<Device[]>("/devices?page=1&page_size=50")
    ]);
    const summary = summaryRes.data;
    const devices = devicesRes.data;

    const deviceRows = devices.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.device_code)} · ${escapeHtml(item.location ?? "—")}</small></td><td>${escapeHtml(item.device_type)}</td><td>${escapeHtml(item.firmware_version ?? "—")}</td><td><span class="status ${item.online ? 'success' : 'error'}">${item.online ? 'ONLINE' : 'OFFLINE'}</span> <span class="status ${item.status === "ACTIVE" ? "success" : item.status === "MAINTENANCE" ? "warning" : "error"}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.last_seen_at ? formatTime(item.last_seen_at) : "Belum pernah")}</td></tr>`).join("");

    shell(`<section class="stats-grid">
      <article class="stat-card sage"><div><span>Total Perangkat</span><strong>${summary.total} Unit</strong></div><span class="trend">🖥️</span></article>
      <article class="stat-card lime"><div><span>Aktif / Online</span><strong>${summary.active} Unit</strong></div><span class="trend">✓</span></article>
      <article class="stat-card ${summary.inactive > 0 ? 'red' : 'neutral'}"><div><span>Offline / Gangguan</span><strong>${summary.inactive + summary.maintenance} Unit</strong></div><span class="trend">!</span></article>
    </section>
    <section class="dashboard-grid" style="grid-template-columns: 1fr;">
      <article class="panel">
        <div class="panel-head">
          <div><h2>Daftar Perangkat IoT</h2><p>Terminal presensi, Gate, dan Reader</p></div>
          <button class="button primary" data-register-device>+ Tambah Perangkat</button>
        </div>
        ${deviceRows ? `<div class="table-wrap"><table><thead><tr><th>Perangkat & Lokasi</th><th>Tipe</th><th>Firmware</th><th>Status</th><th>Terakhir Aktif</th></tr></thead><tbody>${deviceRows}</tbody></table></div>` : emptyState("Data belum tersedia", "Tambahkan perangkat pertama untuk memulai.")}
      </article>
    </section>`, "Perangkat", "Status IoT gate, terminal, LED, dan card station sekolah.");
    document.querySelector<HTMLButtonElement>("[data-register-device]")?.addEventListener("click", async () => {
      try { await registerSchoolDevice(state.school!.id); await devicesPage(); }
      catch (error) { const panel=document.querySelector(".content");if(panel)panel.insertAdjacentHTML("afterbegin",errorState(error)); }
    });
  } catch (error) { shell(errorState(error), "Perangkat", "Status IoT gate, terminal, LED, dan card station sekolah."); }
}
async function attendancePage(): Promise<void> {
  shell(`<section class="stats-grid">${Array.from({ length: 2 }, () => skeleton(1)).join("")}</section>`, "Kehadiran", "Log presensi gerbang yang sudah tervalidasi dan idempotent.");
  try {
    const [summaryRes, logsRes] = await Promise.all([
      api<{ total_present: number, total_late: number }>("/attendance/summary"),
      api<Attendance[]>("/attendance?page=1&page_size=50")
    ]);
    const summary = summaryRes.data;
    const logs = logsRes.data;

    const logRows = logs.map(item => {
      const student = relation(item.students);
      return `<tr><td><strong>${escapeHtml(student?.full_name ?? "Siswa")}</strong><small>${escapeHtml(student?.student_number)}</small></td><td>${escapeHtml(relation(item.classes)?.name ?? "—")}</td><td>${item.direction === "CHECK_IN" ? "Masuk" : "Pulang"}</td><td>${formatTime(item.occurred_at_local)}</td><td><span class="status ${item.is_late ? "warning" : "success"}">${item.is_late ? "Terlambat" : "Tepat waktu"}</span></td></tr>`;
    }).join("");

    shell(`<section class="stats-grid">
      <article class="stat-card lime"><div><span>Kehadiran Hari Ini</span><strong>${summary.total_present} Siswa</strong></div><span class="trend">✓</span></article>
      <article class="stat-card ${summary.total_late > 0 ? 'red' : 'sage'}"><div><span>Terlambat Hari Ini</span><strong>${summary.total_late} Siswa</strong></div><span class="trend">!</span></article>
    </section>
    <section class="dashboard-grid" style="grid-template-columns: 1fr;">
      <article class="panel">
        <div class="panel-head"><h2>Riwayat Kehadiran (50 Terakhir)</h2><p>Log presensi gerbang yang tervalidasi</p></div>
        ${logRows ? `<div class="table-wrap"><table><thead><tr><th>Siswa</th><th>Kelas</th><th>Arah</th><th>Waktu</th><th>Keterangan</th></tr></thead><tbody>${logRows}</tbody></table></div>` : emptyState("Data belum tersedia", "Tambahkan data pertama untuk memulai.")}
      </article>
    </section>`, "Kehadiran", "Log presensi gerbang yang sudah tervalidasi dan idempotent.");
  } catch (error) { shell(errorState(error), "Kehadiran", "Log presensi gerbang yang sudah tervalidasi dan idempotent."); }
}

function studentImportPage(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const initialClassId = urlParams.get("class_id");
  const initialClassName = urlParams.get("class_name");

  shell(`<section class="panel">
    <div class="panel-head">
      <h2>Import Data Siswa (Berbasis Kelas / Paralel)</h2>
      <p>Unggah file Excel (.xlsx, .xls) atau CSV Dapodik. Tentukan kelas target tujuan terlebih dahulu agar seluruh siswa di-import tepat ke kelasnya.</p>
    </div>

    <!-- Banner Panduan Import Berbasis Kelas -->
    <div style="margin-bottom:1.5rem;padding:1.25rem;background:#f0f9ff;border:1.5px solid #7dd3fc;border-radius:0.75rem;">
      <h3 style="margin:0 0 0.5rem;color:#0369a1;font-size:1rem;display:flex;align-items:center;gap:0.5rem;">
        💡 Panduan Impor Berbasis Kelas (Sistem Paralel SMA)
      </h3>
      <p style="margin:0 0 0.5rem;font-size:0.85rem;color:#075985;line-height:1.5;">
        Sistem AKSIS mendukung fleksibilitas penamaan kelas SMA (seperti <strong>X-1, X-A, XI MIPA 1, XI IPS 2</strong>, dsb). Untuk menjaga kerapihan data siswa:
      </p>
      <ul style="margin:0 0 0.25rem 1.25rem;font-size:0.83rem;color:#0369a1;line-height:1.6;">
        <li><strong>Pilih Kelas Target:</strong> Tentukan kelas tujuan pada dropdown di bawah sebelum mengunggah file.</li>
        <li><strong>1 File Khusus 1 Kelas:</strong> File Excel / CSV wajib berisi data siswa khusus untuk kelas yang sedang dipilih (tidak dicampur antar kelas).</li>
        <li><strong>Template Terkunci Otomatis:</strong> Tombol unduh template akan secara otomatis menyesuaikan nama kelas sesuai pilihan Anda.</li>
      </ul>
    </div>

    <!-- Dropdown Selector Kelas Target -->
    <div style="margin-bottom:1.5rem;padding:1.25rem;background:var(--bg-subtle,#f8fafc);border:1.5px solid var(--line,#e2e8f0);border-radius:0.75rem;">
      <label style="font-weight:700;font-size:0.92rem;color:var(--text);margin-bottom:0.4rem;display:block;">
        🏫 Pilih Kelas Target Tujuan Impor
      </label>
      <select id="target-class-select" style="width:100%;max-width:450px;padding:0.65rem 0.85rem;border-radius:0.5rem;border:1.5px solid var(--line);background:var(--bg);color:var(--text);font-weight:600;font-size:0.9rem;">
        <option value="">-- Impor Bebas / Deteksi Otomatis dari File --</option>
      </select>
      <p id="target-class-info" style="font-size:0.8rem;color:var(--muted);margin:0.4rem 0 0;">
        Memuat daftar kelas master...
      </p>
    </div>

    <!-- Download Template Action Card -->
    <div style="margin-bottom:1.5rem;padding:1rem;background:var(--bg-subtle,#f8fafc);border:1px solid var(--line,#e2e8f0);border-radius:0.75rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
      <div>
        <strong id="template-card-title" style="font-size:0.92rem;color:var(--text)">Format Excel / CSV Standar Dapodik</strong>
        <p style="font-size:0.8rem;color:var(--muted);margin:0.2rem 0 0;">Kolom: No., Nama Lengkap, NISN, Kelas, Tempat Lahir, Tanggal Lahir (YYYY-MM-DD), Alamat, Jenis Kelamin (L/P)</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button type="button" id="btn-download-excel" class="button primary" style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.8rem;padding:0.45rem 0.85rem;">
          📊 Unduh Template Excel (.xlsx)
        </button>
        <button type="button" id="btn-download-template" class="button secondary" style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.8rem;padding:0.45rem 0.85rem;">
          📄 Unduh Template CSV (.csv)
        </button>
      </div>
    </div>

    <form id="import-form" class="login-form" style="margin:0;">
      <label style="font-weight:600;margin-bottom:0.5rem;display:block;">Pilih File Excel / CSV Dapodik <input type="file" id="csv-file" accept=".xlsx,.xls,.csv" required /></label>
      <div id="import-preview"></div>
      <div style="display:flex;gap:1rem;margin-top:1.5rem;">
        <button class="button primary" type="submit" id="import-submit">Preview & Validasi Data</button>
        <a href="/students" data-link class="button secondary">Batal</a>
      </div>
    </form>
  </section>`, "Import Siswa", "Tambahkan data siswa secara massal berbasis kelas / paralel.");

  setTimeout(async () => {
    const classSelect = document.getElementById("target-class-select") as HTMLSelectElement;
    const classInfo = document.getElementById("target-class-info") as HTMLParagraphElement;
    const templateTitle = document.getElementById("template-card-title") as HTMLElement;
    const form = document.getElementById("import-form") as HTMLFormElement;
    const fileInput = document.getElementById("csv-file") as HTMLInputElement;
    const preview = document.getElementById("import-preview") as HTMLDivElement;
    const submitBtn = document.getElementById("import-submit") as HTMLButtonElement;
    const downloadBtn = document.getElementById("btn-download-template") as HTMLButtonElement;
    const downloadExcelBtn = document.getElementById("btn-download-excel") as HTMLButtonElement;

    let availableClasses: Array<{ id: string; name: string; student_count?: number }> = [];

    try {
      const res = await api<{ id: string; name: string; student_count: number }[]>("/classes/summary");
      availableClasses = res.data ?? [];
      classSelect.innerHTML = `<option value="">-- Impor Bebas / Deteksi Otomatis dari File --</option>` +
        availableClasses.map(c => `<option value="${c.id}" data-name="${escapeHtml(c.name)}"${(initialClassId === c.id || (initialClassName && initialClassName.toLowerCase() === c.name.toLowerCase())) ? " selected" : ""}>Kelas ${escapeHtml(c.name)} (${c.student_count} siswa)</option>`).join("");

      const updateClassSelectionState = () => {
        const selectedOpt = classSelect.options[classSelect.selectedIndex];
        const selectedId = classSelect.value;
        const selectedName = selectedOpt?.dataset?.name || "";

        if (selectedId && selectedName) {
          classInfo.innerHTML = `💡 Seluruh siswa dalam file akan di-import ke <strong>Kelas ${escapeHtml(selectedName)}</strong>.`;
          classInfo.style.color = "#0369a1";
          templateTitle.innerHTML = `Template Spesifik: <strong>Kelas ${escapeHtml(selectedName)}</strong>`;
          downloadExcelBtn.textContent = `📊 Unduh Template Excel (${selectedName})`;
          downloadBtn.textContent = `📄 Unduh Template CSV (${selectedName})`;
        } else {
          classInfo.textContent = "Jika kelas target dipilih, template yang diunduh dan validasi file akan otomatis terhubung ke kelas tersebut.";
          classInfo.style.color = "var(--muted)";
          templateTitle.textContent = "Format Excel / CSV Standar Dapodik";
          downloadExcelBtn.textContent = "📊 Unduh Template Excel (.xlsx)";
          downloadBtn.textContent = "📄 Unduh Template CSV (.csv)";
        }
      };

      classSelect.addEventListener("change", updateClassSelectionState);
      updateClassSelectionState();
    } catch (e) {
      classInfo.textContent = "Gagal memuat daftar kelas master.";
    }

    let parsedData: any[] = [];
    let isPreview = true;
    let selectedTargetClassId = "";
    let selectedTargetClassName = "";

    downloadExcelBtn?.addEventListener("click", () => {
      const selectedOpt = classSelect.options[classSelect.selectedIndex];
      const targetName = selectedOpt?.dataset?.name || "X-1";
      const templateData = [
        ["No.", "Nama Lengkap", "NISN", "Kelas", "Tempat Lahir", "Tanggal Lahir", "Alamat", "Jenis Kelamin"],
        [1, "Ahmad Fauzi", "0075849301", targetName, "Watampone", "2008-05-14", "Jl. Merdeka No. 12, Watampone", "Laki-laki"],
        [2, "Nur Aisyah Dahlan", "0076928412", targetName, "Bone", "2008-08-22", "Jl. Ahmad Yani No. 45, Tanete Riattang", "Perempuan"]
      ];
      const ws = XLSX.utils.aoa_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dapodik");
      const filename = classSelect.value && targetName !== "X-1" ? `template_import_siswa_${targetName.replace(/\s+/g, "_")}.xlsx` : "template_dapodik_aksis.xlsx";
      XLSX.writeFile(wb, filename);
    });

    downloadBtn?.addEventListener("click", () => {
      const selectedOpt = classSelect.options[classSelect.selectedIndex];
      const targetName = selectedOpt?.dataset?.name || "X-1";
      const templateContent = "\uFEFFsep=;\n" +
        "No.;Nama Lengkap;NISN;Kelas;Tempat Lahir;Tanggal Lahir;Alamat;Jenis Kelamin\n" +
        `1;Ahmad Fauzi;0075849301;${targetName};Watampone;2008-05-14;Jl. Merdeka No. 12, Watampone;Laki-laki\n` +
        `2;Nur Aisyah Dahlan;0076928412;${targetName};Bone;2008-08-22;Jl. Ahmad Yani No. 45, Tanete Riattang;Perempuan\n`;
      const blob = new Blob([templateContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const filename = classSelect.value && targetName !== "X-1" ? `template_import_siswa_${targetName.replace(/\s+/g, "_")}.csv` : "template_dapodik_aksis.csv";
      link.download = filename;
      link.click();
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isPreview) {
        const file = fileInput.files?.[0];
        if (!file) return;

        const selectedOpt = classSelect.options[classSelect.selectedIndex];
        selectedTargetClassId = classSelect.value;
        selectedTargetClassName = selectedOpt?.dataset?.name || "";

        try {
          const arrayBuffer = await file.arrayBuffer();
          const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
          const firstSheet = wb.Sheets[wb.SheetNames[0]!];
          if (!firstSheet) throw new Error("File spreadsheet tidak memiliki lembar kerja (worksheet).");

          const rawRows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, raw: false });
          const rows = rawRows.map(r => (r || []).map(cell => String(cell ?? "").trim())).filter(r => r.some(c => c.length > 0));

          if (rows.length < 2) {
            preview.innerHTML = `<div class="banner error" style="margin-top:1rem;color:#dc2626;background:#fef2f2;padding:1rem;border-radius:0.5rem;">File Excel / CSV kosong atau tidak memiliki baris data siswa.</div>`;
            return;
          }

          let headerIdx = 0;
          for (let i = 0; i < Math.min(5, rows.length); i++) {
            const rStr = rows[i]!.join(" ").toLowerCase();
            if (rStr.includes("nama") || rStr.includes("nisn") || rStr.includes("kelas")) {
              headerIdx = i;
              break;
            }
          }

          const headers = rows[headerIdx]!.map(h => h.toLowerCase());
          const getIdx = (name: string) => headers.findIndex(h => h.includes(name));

          const nameIdx = getIdx("nama");
          const nisnIdx = getIdx("nisn");
          const classIdx = getIdx("kelas");
          const pobIdx = getIdx("tempat");
          const dobIdx = getIdx("tanggal") !== -1 ? getIdx("tanggal") : getIdx("tgl");
          const addrIdx = getIdx("alamat");
          const genderIdx = getIdx("jenis") !== -1 ? getIdx("jenis") : getIdx("kelamin");

          parsedData = [];
          const validationErrors: Array<{ rowNum: number; name: string; missing: string[] }> = [];

          rows.slice(headerIdx + 1).forEach((cols, index) => {
            const rowNum = headerIdx + index + 2;
            const fullName = cols[nameIdx !== -1 ? nameIdx : 1] || cols[1] || "";
            const nisn = cols[nisnIdx !== -1 ? nisnIdx : 2] || cols[2] || "";
            let fileClassName = cols[classIdx !== -1 ? classIdx : 3] || cols[3] || "";
            const pob = cols[pobIdx !== -1 ? pobIdx : 4] || cols[4] || "";
            let dob = cols[dobIdx !== -1 ? dobIdx : 5] || cols[5] || "";
            const address = cols[addrIdx !== -1 ? addrIdx : 6] || cols[6] || "";
            const rawGender = (cols[genderIdx !== -1 ? genderIdx : 7] || cols[7] || "").toUpperCase();

            // Format date if in DD/MM/YYYY format
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dob)) {
              const [d, m, y] = dob.split("/");
              dob = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
            }

            // Target Class Matching & Resolution
            let resolvedClassName = selectedTargetClassName || fileClassName;
            let resolvedClassId = selectedTargetClassId || undefined;

            const missingFields: string[] = [];
            if (!fullName) missingFields.push("Nama Lengkap");
            if (!nisn) missingFields.push("NISN");
            if (!pob) missingFields.push("Tempat Lahir");
            if (!dob) missingFields.push("Tanggal Lahir");
            if (!address) missingFields.push("Alamat");
            if (!rawGender) missingFields.push("Jenis Kelamin");

            // Check Mismatch if target class selected & file specifies a different class
            if (selectedTargetClassName && fileClassName && fileClassName.toLowerCase() !== selectedTargetClassName.toLowerCase()) {
              missingFields.push(`Mismatch Kelas (File: "${fileClassName}", Target: "${selectedTargetClassName}")`);
            }

            if (missingFields.length > 0) {
              validationErrors.push({ rowNum, name: fullName || "(Tanpa Nama)", missing: missingFields });
            } else {
              const gender = rawGender.startsWith("L") || rawGender === "MALE" ? "MALE" : rawGender.startsWith("P") || rawGender === "FEMALE" ? "FEMALE" : "OTHER";
              parsedData.push({
                student_number: nisn,
                nisn,
                full_name: fullName,
                class_id: resolvedClassId,
                class_name: resolvedClassName || undefined,
                pob,
                date_of_birth: dob,
                address,
                gender
              });
            }
          });

          if (validationErrors.length > 0) {
            preview.innerHTML = `
              <div style="margin-top:1.5rem;padding:1.25rem;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:0.75rem;">
                <h3 style="margin:0 0 0.5rem;color:#991b1b;font-size:1.05rem;display:flex;align-items:center;gap:0.5rem;">
                  ⚠️ Validasi Dapodik Gagal: ${validationErrors.length} Baris Data Bermasalah
                </h3>
                <p style="margin:0 0 1rem;font-size:0.88rem;color:#b91c1c;">
                  Seluruh kolom wajib harus terisi dan kelas di dalam file harus sesuai dengan Kelas Tujuan yang dipilih.
                </p>
                <div class="table-wrap" style="max-height:250px;overflow-y:auto;border:1px solid #fecaca;border-radius:0.5rem;background:white;">
                  <table style="font-size:0.85rem;">
                    <thead>
                      <tr style="background:#fee2e2;color:#991b1b;">
                        <th style="padding:8px 12px;">Baris #</th>
                        <th style="padding:8px 12px;">Nama Siswa</th>
                        <th style="padding:8px 12px;">Kolom Kosong / Peringatan Mismatch</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${validationErrors.map(err => `
                        <tr>
                          <td style="padding:8px 12px;font-weight:600;color:#991b1b;">Baris ${err.rowNum}</td>
                          <td style="padding:8px 12px;">${escapeHtml(err.name)}</td>
                          <td style="padding:8px 12px;color:#dc2626;font-weight:500;">
                            ${err.missing.join(", ")}
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
                <p style="margin-top:0.75rem;font-size:0.82rem;color:#7f1d1d;">
                  💡 Silakan sesuaikan file Excel/CSV Anda atau ubah pilihan Kelas Target di atas lalu klik Preview kembali.
                </p>
              </div>
            `;
            submitBtn.style.display = "inline-block";
            submitBtn.disabled = true;
            submitBtn.textContent = "Gagal Validasi - Perbaiki File";
          } else {
            // Check existing students in DB by NISN / student_number
            submitBtn.textContent = "Memeriksa data di database...";
            submitBtn.disabled = true;

            const nisns = parsedData.map(s => s.nisn).filter(Boolean);
            const studentNumbers = parsedData.map(s => s.student_number).filter(Boolean);
            const existingSet = new Set<string>();

            try {
              const checkRes = await api<{ existing: Array<{ id: string; nisn?: string; student_number?: string; full_name?: string }> }>("/students/check-existing", {
                method: "POST",
                body: JSON.stringify({ nisns, student_numbers: studentNumbers })
              });
              const existingList = checkRes.data?.existing || [];
              existingList.forEach(e => {
                if (e.nisn) existingSet.add(String(e.nisn).trim().toLowerCase());
                if (e.student_number) existingSet.add(String(e.student_number).trim().toLowerCase());
              });
            } catch (checkErr) {
              console.warn("Could not check existing students", checkErr);
            }

            let existingCount = 0;
            parsedData.forEach(s => {
              const matchNisn = s.nisn && existingSet.has(String(s.nisn).trim().toLowerCase());
              const matchNum = s.student_number && existingSet.has(String(s.student_number).trim().toLowerCase());
              s.isExisting = Boolean(matchNisn || matchNum);
              if (s.isExisting) existingCount++;
            });

            submitBtn.style.display = "none";

            preview.innerHTML = `
              <div style="margin-top:1.5rem;padding:1.25rem;background:${existingCount > 0 ? '#fffbeb' : '#f0fdf4'};border:1.5px solid ${existingCount > 0 ? '#fde68a' : '#86efac'};border-radius:0.75rem;">
                <h4 style="margin:0 0 0.5rem;color:${existingCount > 0 ? '#92400e' : '#166534'};display:flex;align-items:center;gap:0.5rem;font-size:1.05rem;">
                  ${existingCount > 0 
                    ? `⚠️ Hasil Pengecekan Data: ${existingCount} dari ${parsedData.length} siswa sudah terekam di database` 
                    : `✅ Validasi Lolos 100% (${parsedData.length} Siswa Baru Siap Di-import${selectedTargetClassName ? ` ke Kelas <strong>${escapeHtml(selectedTargetClassName)}</strong>` : ""})`}
                </h4>
                <p style="margin:0 0 0.75rem;font-size:0.88rem;color:${existingCount > 0 ? '#b45309' : '#15803d'};line-height:1.5;">
                  ${existingCount > 0 
                    ? `Terdapat <strong>${existingCount} data siswa</strong> yang NISN / nomor induknya sudah terdaftar di database sekolah. Siswa tersebut ditandai pada tabel di bawah.` 
                    : `Data Dapodik terverifikasi lengkap. Status awal kartu siswa diset ke <strong>BLOCKED / Waiting Photo</strong> hingga foto diunggah.`}
                </p>

                <!-- Preview Table -->
                <div class="table-wrap" style="max-height:350px;overflow-y:auto;background:white;border:1px solid ${existingCount > 0 ? '#fde68a' : '#bbf7d0'};border-radius:0.5rem;">
                  <table style="font-size:0.85rem;">
                    <thead>
                      <tr style="background:${existingCount > 0 ? '#fef3c7' : '#f0fdf4'};color:${existingCount > 0 ? '#92400e' : '#166534'};">
                        <th style="padding:10px 12px;">Status Identitas</th>
                        <th style="padding:10px 12px;">NISN</th>
                        <th style="padding:10px 12px;">Nama Lengkap</th>
                        <th style="padding:10px 12px;">Kelas Target</th>
                        <th style="padding:10px 12px;">Tempat / Tgl Lahir</th>
                        <th style="padding:10px 12px;">Alamat</th>
                        <th style="padding:10px 12px;">JK</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${parsedData.map(s => `
                        <tr style="${s.isExisting ? 'background:#fffdf0;' : ''}">
                          <td style="padding:8px 12px;">
                            ${s.isExisting 
                              ? `<span class="pill" style="font-size:0.75rem;padding:3px 8px;background:#fef3c7;color:#b45309;font-weight:700;border:1px solid #fde68a;display:inline-flex;align-items:center;gap:0.3rem;">⚠️ Data Sudah Ada di Database</span>` 
                              : `<span class="pill" style="font-size:0.75rem;padding:3px 8px;background:#dcfce7;color:#15803d;font-weight:700;border:1px solid #bbf7d0;display:inline-flex;align-items:center;gap:0.3rem;">✨ Siswa Baru</span>`}
                          </td>
                          <td style="padding:8px 12px;"><strong>${escapeHtml(s.nisn)}</strong></td>
                          <td style="padding:8px 12px;font-weight:600;color:var(--text);">${escapeHtml(s.full_name)}</td>
                          <td style="padding:8px 12px;"><span class="pill" style="font-size:0.75rem;padding:2px 8px;background:#e0f2fe;color:#0369a1;font-weight:600;">${escapeHtml(s.class_name || "-")}</span></td>
                          <td style="padding:8px 12px;">${escapeHtml(s.pob || "-")}, ${escapeHtml(s.date_of_birth || "-")}</td>
                          <td style="padding:8px 12px;"><small>${escapeHtml(s.address || "-")}</small></td>
                          <td style="padding:8px 12px;">${s.gender === "MALE" ? "L" : s.gender === "FEMALE" ? "P" : "-"}</td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>

                <!-- Opsi Checklist Timpa / Ganti Data Lama -->
                <div style="margin-top:1.25rem;padding:1.1rem;background:${existingCount > 0 ? '#fffbeb' : '#f8fafc'};border:1.5px solid ${existingCount > 0 ? '#fde68a' : '#cbd5e1'};border-radius:0.75rem;">
                  <label style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;font-weight:700;color:var(--text);font-size:0.92rem;">
                    <input type="checkbox" id="chk-overwrite-existing" style="width:1.25rem;height:1.25rem;accent-color:#0284c7;cursor:pointer;" ${existingCount > 0 ? 'checked' : ''} />
                    <span>Timpa / ganti data lama untuk siswa yang sudah ada</span>
                  </label>
                  <p style="margin:0.4rem 0 0 2rem;font-size:0.82rem;color:var(--muted);line-height:1.4;">
                    Jika dicentang, profil & identitas siswa lama dengan NISN/NIS yang cocok di database akan diperbarui dengan data baru dari file ini. Jika tidak dicentang, data siswa lama akan tetap dipertahankan.
                  </p>
                </div>

                <!-- Action Buttons: Import & Batal -->
                <div style="display:flex;gap:1rem;margin-top:1.25rem;">
                  <button type="button" class="button primary" id="btn-execute-import" style="padding:0.7rem 1.5rem;font-weight:700;font-size:0.95rem;">
                    Import (${parsedData.length} Siswa)
                  </button>
                  <a href="/students" data-link class="button secondary" style="padding:0.7rem 1.5rem;font-size:0.95rem;">Batal</a>
                </div>
              </div>
            `;

            const btnExecute = document.getElementById("btn-execute-import") as HTMLButtonElement;
            btnExecute?.addEventListener("click", async () => {
              const chkOverwrite = document.getElementById("chk-overwrite-existing") as HTMLInputElement;
              const shouldOverwrite = chkOverwrite?.checked ?? false;

              btnExecute.disabled = true;
              btnExecute.textContent = "Menyimpan ke Database...";

              try {
                const cleanStudents = parsedData.map(s => {
                  const { isExisting, ...rest } = s;
                  return rest;
                });

                const batchRes = await api<{ success: boolean; inserted: number; updated: number; skipped: number; total: number }>("/students/batch", {
                  method: "POST",
                  body: JSON.stringify({
                    students: cleanStudents,
                    overwrite: shouldOverwrite
                  })
                });

                const { inserted = 0, updated = 0, skipped = 0 } = batchRes.data ?? {};

                let summaryMsg = `Berhasil meng-import ${parsedData.length} siswa. (${inserted} siswa baru`;
                if (updated > 0) summaryMsg += `, ${updated} data siswa diperbarui`;
                if (skipped > 0) summaryMsg += `, ${skipped} data siswa lama dipertahankan`;
                summaryMsg += `).`;

                toastSuccess(summaryMsg);
                navigate(`/students${selectedTargetClassId ? `?class_id=${encodeURIComponent(selectedTargetClassId)}` : ""}`);
              } catch (error) {
                const errMsg = error instanceof ApiClientError ? error.message : "Terjadi kendala saat meng-import data siswa.";
                preview.innerHTML = `
                  <div style="margin-top:1.5rem;padding:1.25rem;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:0.75rem;">
                    <h4 style="margin:0 0 0.5rem;color:#991b1b;display:flex;align-items:center;gap:0.5rem;font-size:1.05rem;">
                      ❌ Impor Gagal Ditulis ke Database
                    </h4>
                    <p style="margin:0 0 1rem;font-size:0.9rem;color:#b91c1c;line-height:1.5;">
                      ${escapeHtml(errMsg)}
                    </p>
                    <p style="font-size:0.82rem;color:#7f1d1d;margin:0 0 1rem;">
                      💡 Periksa pesan kesalahan di atas, sesuaikan file Excel/CSV Anda atau centang opsi "Timpa / ganti data lama" jika data sudah pernah di-import sebelumnya.
                    </p>
                    <button type="button" class="button secondary" id="btn-retry-import" style="font-size:0.85rem;">Coba Lakukan Impor Ulang</button>
                  </div>
                `;
                btnExecute.disabled = false;
                btnExecute.textContent = `Import (${parsedData.length} Siswa)`;
                document.getElementById("btn-retry-import")?.addEventListener("click", () => {
                  btnExecute.click();
                });
              }
            });

            isPreview = false;
          }
        } catch (err: any) {
          preview.innerHTML = `<div class="banner error" style="margin-top:1rem;color:#dc2626;background:#fef2f2;padding:1rem;border-radius:0.5rem;">Gagal membaca file Excel/CSV: ${escapeHtml(err?.message || String(err))}</div>`;
          submitBtn.disabled = false;
        }
      }
    });
  }, 0);
}

function classPromotionPage(): void {
  shell(`<section class="panel"><div class="panel-head"><h2>Kenaikan Kelas Massal (CSV)</h2><p>Pilih Tahun Ajaran baru, lalu upload file CSV (Header: NIS, Nama Kelas Tujuan). Pastikan kelas tujuan sudah ada di Master Kelas.</p></div>
    <form id="promotion-form" class="login-form" style="margin:0;">
      <label>Tahun Ajaran Tujuan 
        <select id="academic-year-select" style="width:100%;padding:.85rem;border-radius:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--text);" required></select>
      </label>
      <label>Tanggal Efektif (Start Date)
        <input type="date" id="start-date" required value="${new Date().toISOString().split('T')[0]}" />
      </label>
      <label>File CSV Kenaikan Kelas <input type="file" id="csv-file" accept=".csv" required /></label>
      <div id="import-preview"></div>
      <div style="display:flex;gap:1rem;margin-top:1rem;">
        <button class="button primary" type="submit" id="import-submit">Preview Data</button>
        <a href="/students" data-link class="button secondary">Batal</a>
      </div>
    </form>
  </section>`, "Kenaikan Kelas", "Pindahkan ratusan siswa ke kelas baru sekaligus via Excel.");

  setTimeout(async () => {
    const yearSelect = document.getElementById("academic-year-select") as HTMLSelectElement;
    const form = document.getElementById("promotion-form") as HTMLFormElement;
    const fileInput = document.getElementById("csv-file") as HTMLInputElement;
    const preview = document.getElementById("import-preview") as HTMLDivElement;
    const submitBtn = document.getElementById("import-submit") as HTMLButtonElement;

    let yearsRes, classesRes, studentsData: Student[] = [];
    try {
      [yearsRes, classesRes] = await Promise.all([
        api<AcademicYear[]>("/academic-years"),
        api<SchoolClass[]>("/classes/summary")
      ]);

      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await api<Student[]>(`/students?page=${page}&page_size=500`);
        studentsData = studentsData.concat(res.data);
        if (res.data.length < 500) hasMore = false;
        else page++;
      }

      yearSelect.innerHTML = yearsRes.data.map(y => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join("");
    } catch (err) {
      preview.innerHTML = errorState(err);
      return;
    }

    let parsedData: any[] = [];
    let isPreview = true;

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isPreview) {
        const file = fileInput.files?.[0];
        if (!file) return;
        const text = await file.text();
        const rows = text.split("\\n").map(r => r.trim()).filter(Boolean);
        parsedData = rows.slice(1).map(row => {
          const cols = row.split(",");
          const nis = cols[0]?.trim();
          const targetClassName = cols[1]?.trim();
          const student = studentsData.find(s => s.student_number === nis);
          const targetClass = classesRes.data.find(c => c.name.toLowerCase() === targetClassName?.toLowerCase());
          return { nis, student_id: student?.id, student_name: student?.full_name, targetClassName, class_id: targetClass?.id };
        });

        const errors = parsedData.filter(d => !d.student_id || !d.class_id);
        if (errors.length > 0) {
          preview.innerHTML = `<div style="background:var(--red);color:white;padding:1rem;border-radius:8px;">Terdapat ${errors.length} baris bermasalah (NIS tidak ditemukan atau Kelas belum ada di Master). Mohon perbaiki CSV Anda. Contoh baris gagal: NIS <b>${escapeHtml(errors[0].nis ?? "")}</b> -> Kelas <b>${escapeHtml(errors[0].targetClassName ?? "")}</b></div>`;
          return;
        }

        preview.innerHTML = `<div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>NIS</th><th>Nama Siswa</th><th>Kelas Tujuan</th></tr></thead><tbody>${parsedData.slice(0, 5).map(s => `<tr><td>${escapeHtml(s.nis)}</td><td>${escapeHtml(s.student_name)}</td><td>${escapeHtml(s.targetClassName)}</td></tr>`).join("")}</tbody></table></div><p style="margin-top:1rem;font-size:0.8rem;color:var(--muted)">Menampilkan 5 data pertama dari total ${parsedData.length} data siap diproses.</p>`;
        submitBtn.textContent = "Proses Kenaikan Kelas";
        isPreview = false;
      } else {
        submitBtn.disabled = true;
        submitBtn.textContent = "Memproses...";
        const yearId = yearSelect.value;
        const startDate = (document.getElementById("start-date") as HTMLInputElement).value;
        try {
          let processed = 0;
          for (const item of parsedData) {
            await api(`/students/${item.student_id}/history`, { method: "POST", body: JSON.stringify({ class_id: item.class_id, academic_year_id: yearId, start_date: startDate }) });
            processed++;
            submitBtn.textContent = `Memproses... ${processed}/${parsedData.length}`;
          }
          toastSuccess("Kenaikan kelas massal berhasil diselesaikan!");
          navigate("/students");
        } catch (error) {
          preview.innerHTML = errorState(error);
          submitBtn.disabled = false;
          submitBtn.textContent = "Coba Lagi";
        }
      }
    });
  }, 0);
}

async function wastePage(): Promise<void> {
  shell(`<section class="stats-grid">${Array.from({ length: 2 }, () => skeleton(1)).join("")}</section>`, "Bank Sampah", "Manajemen setoran sampah (Waste-to-Gold).");
  try {
    const [summaryRes, rankingRes] = await Promise.all([
      api<{ organic_kg: number, inorganic_kg: number, total_kg: number }>("/waste/summary"),
      api<{ class_id: string, class_name: string, total_kg: number }[]>("/waste/ranking")
    ]);
    const summary = summaryRes.data;
    const rankingRows = rankingRes.data.map((r, i) => `<tr><td><strong>#${i + 1}</strong></td><td>${escapeHtml(r.class_name)}</td><td>${r.total_kg.toFixed(1)} kg</td></tr>`).join("");

    shell(`<section class="stats-grid">
      <article class="stat-card lime"><div><span>Total Sampah Terkumpul</span><strong>${summary.total_kg.toFixed(1)} Kg</strong></div><span class="trend">♻</span></article>
      <article class="stat-card sage"><div><span>Total Organik</span><strong>${summary.organic_kg.toFixed(1)} Kg</strong></div><span class="trend">↑</span></article>
      <article class="stat-card sage"><div><span>Total Anorganik</span><strong>${summary.inorganic_kg.toFixed(1)} Kg</strong></div><span class="trend">↑</span></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <div class="panel-head"><h2>Jadwal Operasional</h2><p>Batas waktu penggunaan PWA</p></div>
        <form id="form-waste-schedule" style="margin-top: 1rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <label>Jam Buka<input type="time" name="start_time" id="waste-start" /></label>
            <label>Jam Tutup<input type="time" name="end_time" id="waste-end" /></label>
          </div>
          <p style="font-size:0.85rem; color:var(--text-light); margin-top:0.5rem; margin-bottom:1rem;">Biarkan kosong jika PWA bebas diakses 24 jam.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <label>Poin / kg organik<input type="number" id="waste-organic-rate" min="0" max="10000" step="0.001" placeholder="Belum diatur" /></label>
            <label>Poin / kg anorganik<input type="number" id="waste-inorganic-rate" min="0" max="10000" step="0.001" placeholder="Belum diatur" /></label>
          </div>
          <p style="font-size:.85rem;margin-top:.5rem">Tarif berlaku untuk setoran baru. Kosongkan jika sekolah belum menggunakan poin; poin setoran lama tetap tersimpan.</p>
          <button type="submit" class="btn">Simpan Pengaturan</button>
        </form>
      </article>
      <article class="panel" style="grid-column: 1 / -1;">
        <div class="panel-head"><h2>Klasemen Bank Sampah</h2><p>Peringkat antar kelas</p></div>
        ${rankingRows ? `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Kelas</th><th>Total Terkumpul</th></tr></thead><tbody>${rankingRows}</tbody></table></div>` : emptyState("Belum ada data setoran", "Data akan muncul ketika siswa menyetorkan sampah via Terminal/PWA.")}
      </article>
    </section>`, "Bank Sampah", "Manajemen setoran sampah (Waste-to-Gold).");

    // Fetch and bind schedule
    const scheduleForm = document.getElementById("form-waste-schedule") as HTMLFormElement;
    if (scheduleForm) {
      const settingsControls = scheduleForm.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button");
      settingsControls.forEach(control => control.disabled = true);
      api<{ waste_start_time: string, waste_end_time: string, waste_organic_points_per_kg: number | null, waste_inorganic_points_per_kg: number | null }>("/schools/current").then(res => {
        (document.getElementById("waste-organic-rate") as HTMLInputElement).value = res.data.waste_organic_points_per_kg == null ? "" : String(res.data.waste_organic_points_per_kg);
        (document.getElementById("waste-inorganic-rate") as HTMLInputElement).value = res.data.waste_inorganic_points_per_kg == null ? "" : String(res.data.waste_inorganic_points_per_kg);
        if (res.data.waste_start_time) (document.getElementById("waste-start") as HTMLInputElement).value = res.data.waste_start_time.substring(0, 5);
        if (res.data.waste_end_time) (document.getElementById("waste-end") as HTMLInputElement).value = res.data.waste_end_time.substring(0, 5);
        settingsControls.forEach(control => control.disabled = false);
      }).catch(error => {
        scheduleForm.insertAdjacentHTML("beforeend", `<p role="alert">Pengaturan belum dimuat: ${escapeHtml(error instanceof Error ? error.message : "Coba muat ulang halaman.")}</p>`);
      });
      scheduleForm.onsubmit = async (e) => {
        e.preventDefault();
        const start = (document.getElementById("waste-start") as HTMLInputElement).value;
        const end = (document.getElementById("waste-end") as HTMLInputElement).value;
        const orgVal = (document.getElementById("waste-organic-rate") as HTMLInputElement).value;
        const inorgVal = (document.getElementById("waste-inorganic-rate") as HTMLInputElement).value;

        await optimistic({
          apply: () => {},
          mutation: () => api("/schools/current", {
            method: "PATCH",
            body: JSON.stringify({
              waste_start_time: start ? start + ":00" : null,
              waste_end_time: end ? end + ":00" : null,
              waste_organic_points_per_kg: orgVal === "" ? null : Number(orgVal),
              waste_inorganic_points_per_kg: inorgVal === "" ? null : Number(inorgVal)
            })
          }),
          rollback: () => {},
          successMessage: "Pengaturan Bank Sampah berhasil disimpan.",
          errorPrefix: "Gagal menyimpan pengaturan Bank Sampah"
        });
      };
    }
  } catch (error) { shell(errorState(error), "Bank Sampah", "Manajemen setoran sampah (Waste-to-Gold)."); }
}

async function libraryPage(): Promise<void> {
  shell(`<section class="panel">${skeleton()}</section>`, "Perpustakaan", "Monitor kunjungan perpustakaan.");
  try {
    const summaryRes = await api<{ class_id: string, class_name: string, total: number }[]>("/library/summary");
    const totalVisits = summaryRes.data.reduce((acc, r) => acc + r.total, 0);
    const summaryRows = summaryRes.data.map((r, i) => `<tr><td><strong>#${i + 1}</strong></td><td>${escapeHtml(r.class_name)}</td><td>${r.total} kunjungan</td></tr>`).join("");
    shell(`<section class="stats-grid"><article class="stat-card blue"><div><span>Total Kunjungan</span><strong>${totalVisits}</strong><small>Semua kelas bulan ini</small></div><span class="trend">▤</span></article></section>
    <section class="dashboard-grid" style="grid-template-columns: 1fr;">
      <article class="panel">
        <div class="panel-head"><h2>Kunjungan Per Kelas</h2><p>Rekap bulan berjalan</p></div>
        ${summaryRows ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Kelas</th><th>Kunjungan</th></tr></thead><tbody>${summaryRows}</tbody></table></div>` : emptyState("Belum ada kunjungan", "Siswa dapat tap kartu di terminal perpustakaan.")}
      </article>
    </section>`, "Perpustakaan", "Monitor rekam jejak kunjungan siswa ke perpustakaan.");
  } catch (error) { shell(errorState(error), "Perpustakaan", "Monitor kunjungan perpustakaan."); }
}

async function extracurricularPage(): Promise<void> {
  shell(`<section class="stats-grid">${Array.from({ length: 2 }, () => skeleton(1)).join("")}</section>`, "Ekstrakurikuler", "Kelola kegiatan dan keanggotaan ekstrakurikuler.");
  try {
    const res = await api<Extracurricular[]>("/extracurriculars");
    const data = res.data;
    const activeCount = data.filter(e => e.is_active).length;

    const rows = data.map(item => `<tr><td><code>${escapeHtml(item.code)}</code></td><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.description ?? "—")}</td><td><button class="status ${item.is_active ? "success" : "neutral"} toggle-status-btn" data-id="${item.id}" data-current="${item.is_active ? 'true' : 'false'}" style="border:none;cursor:pointer;" title="Klik untuk mengubah status">${item.is_active ? "Aktif" : "Nonaktif"} ⟳</button></td></tr>`).join("");

    shell(`<section class="stats-grid">
      <article class="stat-card blue"><div><span>Total Ekstrakurikuler</span><strong>${data.length} Kegiatan</strong></div><span class="trend">⚽</span></article>
      <article class="stat-card lime"><div><span>Ekskul Aktif</span><strong>${activeCount} Kegiatan</strong></div><span class="trend">✓</span></article>
    </section>
    <section class="dashboard-grid" style="grid-template-columns: 1fr;">
      <article class="panel">
        <div class="panel-head">
          <div><h2>Daftar Ekstrakurikuler</h2><p>Data referensi kegiatan siswa</p></div>
          <button id="btn-add-ekskul" class="button primary">+ Tambah Ekskul</button>
        </div>
        ${rows ? `<div class="table-wrap"><table id="ekskul-table"><thead><tr><th>Kode</th><th>Nama Ekskul</th><th>Deskripsi</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState("Belum ada ekstrakurikuler", "Tambahkan ekstrakurikuler pertama untuk memulai.")}
      </article>
    </section>
    
    <div id="ekskul-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;overflow-y:auto;padding:2rem;">
      <div style="background:var(--bg);max-width:500px;margin:auto;border-radius:1rem;padding:2rem;position:relative;">
        <button id="close-ekskul-modal" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text);">&times;</button>
        <h2>Tambah Ekstrakurikuler</h2>
        <p style="margin-bottom:1.5rem;color:var(--text-light);">Tambahkan referensi kegiatan ekstrakurikuler baru.</p>
        <form id="ekskul-form" class="login-form" style="margin:0;">
          <div id="ekskul-error" style="display:none;background:var(--red);color:white;padding:0.75rem;border-radius:0.5rem;font-size:0.875rem;margin-bottom:1rem;"></div>
          <label>Kode (Singkatan)<input id="ekskul-code" type="text" placeholder="Cth: PRAM, BSKT, PASK" pattern="[A-Za-z0-9_-]+" required maxlength="32" /></label>
          <label>Nama Ekstrakurikuler<input id="ekskul-name" type="text" placeholder="Cth: Pramuka, Bola Basket" required maxlength="120" /></label>
          <label>Deskripsi (Opsional)<textarea id="ekskul-desc" rows="3" placeholder="Penjelasan singkat mengenai ekskul..." style="width:100%;padding:.85rem;border-radius:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--text);font-family:inherit;"></textarea></label>
          <button id="ekskul-submit" class="button primary" type="submit" style="margin-top:1rem;">Simpan Ekstrakurikuler</button>
        </form>
      </div>
    </div>`, "Ekstrakurikuler", "Kelola referensi kegiatan untuk aplikasi presensi guru.");

    setTimeout(() => {
      const modal = document.getElementById("ekskul-modal") as HTMLDivElement;
      document.getElementById("btn-add-ekskul")?.addEventListener("click", () => modal.style.display = "flex");
      document.getElementById("close-ekskul-modal")?.addEventListener("click", () => modal.style.display = "none");

      const form = document.getElementById("ekskul-form") as HTMLFormElement;
      const errorDiv = document.getElementById("ekskul-error") as HTMLDivElement;
      const submitBtn = document.getElementById("ekskul-submit") as HTMLButtonElement;

      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorDiv.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.textContent = "Menyimpan...";

        try {
          const code = (document.getElementById("ekskul-code") as HTMLInputElement).value;
          const name = (document.getElementById("ekskul-name") as HTMLInputElement).value;
          const desc = (document.getElementById("ekskul-desc") as HTMLTextAreaElement).value;

          await api("/extracurriculars", {
            method: "POST",
            body: JSON.stringify({
              code: code.trim(),
              name: name.trim(),
              description: desc.trim() || null
            })
          });

          // Optimistic: close modal, append row, show toast
          modal.style.display = "none";
          const tbody = document.querySelector("#ekskul-table tbody");
          if (tbody) {
            const newRow = document.createElement("tr");
            newRow.className = "row-inserting";
            newRow.innerHTML = `<td><code>${escapeHtml(code.trim())}</code></td><td><strong>${escapeHtml(name.trim())}</strong></td><td>${escapeHtml(desc.trim() || "—")}</td><td><span class="status success">Aktif</span></td>`;
            tbody.appendChild(newRow);
          }
          // Update stat counts
          const statCards = document.querySelectorAll(".stat-card strong");
          if (statCards[0]) {
            const prev = parseInt(statCards[0].textContent || "0");
            statCards[0].textContent = `${prev + 1} Kegiatan`;
          }
          if (statCards[1]) {
            const prev = parseInt(statCards[1].textContent || "0");
            statCards[1].textContent = `${prev + 1} Kegiatan`;
          }
          toastSuccess(`Ekstrakurikuler "${name.trim()}" berhasil ditambahkan.`);
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = "Simpan Ekstrakurikuler";
        } catch (err: any) {
          errorDiv.textContent = err.message || "Gagal menyimpan data.";
          errorDiv.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "Simpan Ekstrakurikuler";
        }
      });

      // Toggle status listener
      document.getElementById("ekskul-table")?.addEventListener("click", async (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("toggle-status-btn")) {
          const id = target.getAttribute("data-id");
          const isCurrentlyActive = target.getAttribute("data-current") === "true";
          const newStatus = !isCurrentlyActive;

          // Optimistic: immediately swap the badge
          const prevText = target.textContent;
          const prevClass = isCurrentlyActive ? "success" : "neutral";
          const nextClass = newStatus ? "success" : "neutral";
          target.textContent = newStatus ? "Aktif ⟳" : "Nonaktif ⟳";
          target.classList.remove(prevClass);
          target.classList.add(nextClass);
          target.setAttribute("data-current", String(newStatus));

          await optimistic({
            apply: () => {},
            mutation: () => api(`/extracurriculars/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ is_active: newStatus })
            }),
            rollback: () => {
              target.textContent = prevText;
              target.classList.remove(nextClass);
              target.classList.add(prevClass);
              target.setAttribute("data-current", String(isCurrentlyActive));
            },
            successMessage: `Status ekskul berhasil diubah ke ${newStatus ? "Aktif" : "Nonaktif"}.`,
            errorPrefix: "Gagal mengubah status ekskul"
          });
        }
      });
    }, 100);
  } catch (error) { shell(errorState(error), "Ekstrakurikuler", "Kelola kegiatan dan absensi ekstrakurikuler."); }
}
async function ledPage(): Promise<void> {
  shell(`<section class="stats-grid">${Array.from({ length: 2 }, () => skeleton(1)).join("")}</section>`, "LED Board", "Manajemen tampilan teks berjalan pada LED matrix gerbang.");
  try {
    const [resContent, resGateways] = await Promise.all([
      api<any[]>("/led/content"),
      api<any[]>("/led/gateways").catch(() => ({ data: [] }))
    ]);

    const data = resContent.data;
    const gateways = resGateways.data || [];

    const activeCount = data.filter(e => e.is_active).length;
    const isGatewayOnline = gateways.some(g => new Date(g.reported_at).getTime() > Date.now() - 5 * 60000);

    const rows = data.map(item => `<tr>
      <td><strong>${escapeHtml(item.title || "—")}</strong></td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.body)}</td>
      <td>${item.priority}</td>
      <td>${item.starts_at ? formatTime(item.starts_at) : "—"} — ${item.ends_at ? formatTime(item.ends_at) : "—"}</td>
      <td><button class="status ${item.is_active ? "success" : "neutral"} toggle-led-btn" data-id="${item.id}" data-current="${item.is_active ? 'true' : 'false'}" style="border:none;cursor:pointer;" title="Klik untuk mengubah status">${item.is_active ? "Aktif" : "Nonaktif"} ⟳</button></td>
    </tr>`).join("");

    shell(`<section class="stats-grid">
      <article class="stat-card blue"><div><span>Pesan Aktif</span><strong>${activeCount} Pesan</strong></div><span class="trend">💬</span></article>
      <article class="stat-card ${isGatewayOnline ? 'lime' : 'red'}"><div><span>Status Gateway</span><strong>${isGatewayOnline ? 'Online' : 'Offline'}</strong></div><span class="trend">${isGatewayOnline ? '✓' : '✗'}</span></article>
    </section>
    <section class="dashboard-grid" style="grid-template-columns: 1fr;">
      <article class="panel">
        <div class="panel-head">
          <div><h2>Daftar Pesan LED</h2><p>Pesan berjalan pada gerbang sekolah</p></div>
          <button id="btn-add-led" class="button primary">+ Tambah Pesan</button>
        </div>
        ${rows ? `<div class="table-wrap"><table id="led-table"><thead><tr><th>Judul</th><th>Isi Pesan</th><th>Prioritas</th><th>Jadwal</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState("Belum ada pesan", "Tambahkan pesan pertama untuk ditampilkan di LED Board.")}
      </article>
    </section>
    
    <div id="led-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;overflow-y:auto;padding:2rem;">
      <div style="background:var(--bg);max-width:500px;margin:auto;border-radius:1rem;padding:2rem;position:relative;">
        <button id="close-led-modal" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text);">&times;</button>
        <h2>Tambah Pesan LED</h2>
        <p style="margin-bottom:1.5rem;color:var(--text-light);">Tambahkan pesan berjalan baru.</p>
        <form id="led-form" class="login-form" style="margin:0;">
          <div id="led-error" style="display:none;background:var(--red);color:white;padding:0.75rem;border-radius:0.5rem;font-size:0.875rem;margin-bottom:1rem;"></div>
          
          <label>Prioritas
            <select id="led-priority" required style="width:100%;padding:.85rem;border-radius:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--text);font-family:inherit;">
              <option value="RUNNING_TEXT">Teks Berjalan Biasa (RUNNING_TEXT)</option>
              <option value="ACHIEVEMENT">Pengumuman Prestasi (ACHIEVEMENT)</option>
              <option value="EMERGENCY">Darurat (EMERGENCY)</option>
            </select>
          </label>
          
          <label>Judul (Opsional)<input id="led-title" type="text" placeholder="Cth: Sambutan Pagi" maxlength="160" /></label>
          <label>Isi Pesan<textarea id="led-body" rows="4" placeholder="Masukkan teks yang akan berjalan di LED..." required maxlength="4000" style="width:100%;padding:.85rem;border-radius:.75rem;border:1px solid var(--line);background:var(--bg);color:var(--text);font-family:inherit;"></textarea></label>
          
          <button id="led-submit" class="button primary" type="submit" style="margin-top:1rem;">Simpan Pesan</button>
        </form>
      </div>
    </div>`, "LED Board", "Manajemen tampilan teks berjalan pada LED matrix gerbang.");

    setTimeout(() => {
      const modal = document.getElementById("led-modal") as HTMLDivElement;
      document.getElementById("btn-add-led")?.addEventListener("click", () => modal.style.display = "flex");
      document.getElementById("close-led-modal")?.addEventListener("click", () => modal.style.display = "none");

      const form = document.getElementById("led-form") as HTMLFormElement;
      const errorDiv = document.getElementById("led-error") as HTMLDivElement;
      const submitBtn = document.getElementById("led-submit") as HTMLButtonElement;

      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorDiv.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.textContent = "Menyimpan...";

        try {
          const priority = (document.getElementById("led-priority") as HTMLSelectElement).value;
          const title = (document.getElementById("led-title") as HTMLInputElement).value;
          const bodyText = (document.getElementById("led-body") as HTMLTextAreaElement).value;

          await api("/led/content", {
            method: "POST",
            body: JSON.stringify({
              priority,
              title: title.trim() || null,
              body: bodyText.trim()
            })
          });

          // Optimistic: close modal, append row, show toast
          modal.style.display = "none";
          const tbody = document.querySelector("#led-table tbody");
          if (tbody) {
            const newRow = document.createElement("tr");
            newRow.className = "row-inserting";
            newRow.innerHTML = `<td><strong>${escapeHtml(title.trim() || "—")}</strong></td><td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(bodyText.trim())}</td><td>${escapeHtml(priority)}</td><td>— — —</td><td><span class="status success">Aktif</span></td>`;
            tbody.appendChild(newRow);
          }
          toastSuccess("Pesan LED berhasil ditambahkan.");
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = "Simpan Pesan";
        } catch (err: any) {
          errorDiv.textContent = err.message || "Gagal menyimpan pesan.";
          errorDiv.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "Simpan Pesan";
        }
      });

      document.getElementById("led-table")?.addEventListener("click", async (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("toggle-led-btn")) {
          const id = target.getAttribute("data-id");
          const isCurrentlyActive = target.getAttribute("data-current") === "true";
          const newStatus = !isCurrentlyActive;

          // Optimistic: immediately swap the badge
          const prevText = target.textContent;
          const prevClass = isCurrentlyActive ? "success" : "neutral";
          const nextClass = newStatus ? "success" : "neutral";
          target.textContent = newStatus ? "Aktif ⟳" : "Nonaktif ⟳";
          target.classList.remove(prevClass);
          target.classList.add(nextClass);
          target.setAttribute("data-current", String(newStatus));

          await optimistic({
            apply: () => {},
            mutation: () => api(`/led/content/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ is_active: newStatus })
            }),
            rollback: () => {
              target.textContent = prevText;
              target.classList.remove(nextClass);
              target.classList.add(prevClass);
              target.setAttribute("data-current", String(isCurrentlyActive));
            },
            successMessage: `Status pesan LED berhasil diubah ke ${newStatus ? "Aktif" : "Nonaktif"}.`,
            errorPrefix: "Gagal mengubah status pesan LED"
          });
        }
      });
    }, 100);
  } catch (error) { shell(errorState(error), "LED Board", "Manajemen tampilan teks berjalan pada LED matrix gerbang."); }
}

async function reportsPage(): Promise<void> {
  shell(`<section class="panel">${skeleton()}</section>`, "Laporan Wali Kelas", "Rekapitulasi data siswa per kelas.");
  try {
    const res = await api<{ id: string, name: string, student_count: number, attendance_count: number, waste_kg: number, library_visits: number, extracurricular_members: number }[]>("/reports/classes-summary");

    const rows = (res.data ?? []).map(cls => `<tr>
        <td><strong>${escapeHtml(cls.name)}</strong><br/><small>${cls.student_count} siswa</small></td>
        <td>${cls.attendance_count}x Hadir</td>
        <td>${Number(cls.waste_kg).toFixed(1)} Kg</td>
        <td>${cls.library_visits}x Datang</td>
        <td>${cls.extracurricular_members ? `<span class="ekskul-pill">★ ${cls.extracurricular_members} Keikutsertaan</span>` : '<span style="color:var(--muted)">0 Ekskul</span>'}</td>
        <td><button class="button secondary" style="font-size:0.75rem;padding:0.4rem 0.8rem" data-print-class="${cls.id}" data-class-name="${escapeHtml(cls.name)}">🖨 Cetak Laporan</button></td>
      </tr>`).join("");

    shell(`<section class="panel">
      <div class="panel-head">
        <div><h2>Rekapitulasi Kinerja Siswa</h2><p>Data berikut dapat dicetak dan diserahkan ke wali kelas masing-masing.</p></div>
        <select id="report-period" style="padding:0.5rem;border-radius:0.5rem;border:1px solid var(--line);background:var(--bg);color:var(--text);">
          <option>September 2026</option><option>Agustus 2026</option><option>Semester Ganjil 2026</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kelas</th><th>Kehadiran</th><th>Sampah</th><th>Perpus</th><th>Ekskul</th><th>Aksi</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6">${emptyState("Belum ada kelas", "Silakan tambahkan data kelas.")}</td></tr>`}</tbody>
        </table>
      </div>
    </section>
    <div id="print-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;overflow-y:auto;padding:2rem;">
      <div style="background:var(--bg);max-width:960px;margin:auto;border-radius:1rem;padding:2rem;position:relative;">
        <button id="close-modal" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text);">&times;</button>
        <div id="print-content"></div>
        <div style="display:flex;gap:1rem;margin-top:1.5rem;justify-content:flex-end;" id="print-actions"></div>
      </div>
    </div>`, "Laporan Wali Kelas", "Rekapitulasi data aktivitas untuk diserahkan ke wali kelas.");

    document.getElementById("close-modal")?.addEventListener("click", () => {
      document.getElementById("print-modal")!.style.display = "none";
    });

    document.querySelectorAll<HTMLButtonElement>("[data-print-class]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const classId = btn.getAttribute("data-print-class")!;
        const className = btn.getAttribute("data-class-name") ?? "Kelas";
        const modal = document.getElementById("print-modal")!;
        const content = document.getElementById("print-content")!;
        const actions = document.getElementById("print-actions")!;
        content.innerHTML = skeleton(6);
        actions.innerHTML = "";
        modal.style.display = "block";
        try {
          interface StudentReportItem {
            full_name: string;
            student_number: string;
            nisn: string;
            attendance_count: number;
            waste_kg: number;
            library_visits: number;
            extracurriculars: string[];
            extracurricular_details?: {
              id: string;
              name: string;
              attended: number;
              total: number;
              percentage: number;
              predicate: string;
            }[];
          }

          const res = await api<StudentReportItem[]>(`/reports/class-report/${classId}`);
          
          const students = res.data ?? [];
          const totStudents = students.length;
          const totAttendance = students.reduce((a, s) => a + (s.attendance_count || 0), 0);
          const totWaste = students.reduce((a, s) => a + (s.waste_kg || 0), 0);
          const totLibrary = students.reduce((a, s) => a + (s.library_visits || 0), 0);
          const totEkskul = students.reduce((a, s) => a + (s.extracurricular_details?.length || s.extracurriculars?.length || 0), 0);

          const studentRows = students.map((s, i) => {
            const details = s.extracurricular_details ?? [];
            const ekskulTags = details.length > 0
              ? `<div class="ekskul-pill-container">${details.map(d => {
                  let predClass = "sangat-baik";
                  if (d.predicate === "Baik") predClass = "baik";
                  else if (d.predicate === "Cukup") predClass = "cukup";
                  else if (d.predicate === "Kurang") predClass = "kurang";

                  const label = d.total > 0 ? `${escapeHtml(d.name)} ${d.percentage}%` : `${escapeHtml(d.name)}`;
                  const tooltip = `${escapeHtml(d.name)}: ${d.attended}/${d.total} Sesi (${d.percentage}%) - Predikat: ${d.predicate}`;
                  return `<span class="ekskul-pill ${predClass}" title="${tooltip}">★ ${label}</span>`;
                }).join("")}</div>`
              : (s.extracurriculars && s.extracurriculars.length > 0
                  ? `<div class="ekskul-pill-container">${s.extracurriculars.map(e => `<span class="ekskul-pill">★ ${escapeHtml(e)}</span>`).join("")}</div>`
                  : `<span class="ekskul-pill-none">&mdash;</span>`);

            return `<tr>
              <td>${i + 1}</td>
              <td><strong>${escapeHtml(s.full_name)}</strong></td>
              <td>${escapeHtml(s.nisn)}</td>
              <td style="text-align:center">${s.attendance_count}</td>
              <td style="text-align:center">${s.waste_kg.toFixed(1)} kg</td>
              <td style="text-align:center">${s.library_visits}</td>
              <td>${ekskulTags}</td>
            </tr>`;
          }).join("");

          const period = (document.getElementById("report-period") as HTMLSelectElement)?.value ?? "";
          const schoolName = state.school?.name ?? "Sekolah";

          content.innerHTML = `
            <div id="printable-area">
              <div style="text-align:center;margin-bottom:1.5rem;border-bottom:2px solid var(--line);padding-bottom:1rem;">
                <h2 style="margin:0;font-size:1.4rem;">${escapeHtml(schoolName)}</h2>
                <p style="margin:0.25rem 0 0.5rem;font-weight:600;color:var(--muted);">LAPORAN REKAPITULASI AKTIVITAS & EKSKUL SISWA</p>
                <p style="margin:0;font-size:0.9rem;">Kelas: <strong>${escapeHtml(className)}</strong> &bull; Periode: <strong>${escapeHtml(period)}</strong></p>
              </div>

              <div class="report-summary-bar">
                <div class="report-summary-item"><span>Total Siswa</span><strong>${totStudents} Siswa</strong></div>
                <div class="report-summary-item"><span>Presensi Hadir</span><strong>${totAttendance}x</strong></div>
                <div class="report-summary-item"><span>Setoran Sampah</span><strong>${totWaste.toFixed(1)} Kg</strong></div>
                <div class="report-summary-item"><span>Visits Perpus</span><strong>${totLibrary}x</strong></div>
                <div class="report-summary-item"><span>Partisipasi Ekskul</span><strong>${totEkskul} Diikuti</strong></div>
              </div>

              <div class="table-wrap">
                <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                  <thead><tr style="background:var(--surface);">
                    <th style="border:1px solid var(--line);padding:0.55rem;width:4%;">No</th>
                    <th style="border:1px solid var(--line);padding:0.55rem;width:24%;">Nama Siswa</th>
                    <th style="border:1px solid var(--line);padding:0.55rem;width:15%;">NISN</th>
                    <th style="border:1px solid var(--line);padding:0.55rem;width:10%;text-align:center;">Hadir</th>
                    <th style="border:1px solid var(--line);padding:0.55rem;width:10%;text-align:center;">Sampah</th>
                    <th style="border:1px solid var(--line);padding:0.55rem;width:10%;text-align:center;">Perpus</th>
                    <th style="border:1px solid var(--line);padding:0.55rem;width:27%;">Kegiatan Ekskul & Presensi</th>
                  </tr></thead>
                  <tbody>${studentRows || '<tr><td colspan="7" style="text-align:center;padding:1.5rem;">Tidak ada data siswa di kelas ini.</td></tr>'}</tbody>
                </table>
              </div>
              <p style="margin-top:1.5rem;font-size:0.8rem;text-align:right;color:var(--muted);">Dicetak pada: ${new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            </div>`;

          actions.innerHTML = `
            <button class="button secondary" id="do-export-csv">📥 Unduh CSV Rapor</button>
            <button class="button primary" id="do-print">🖨 Cetak / Print PDF</button>
          `;

          document.getElementById("do-export-csv")?.addEventListener("click", () => {
            const csvRows: string[] = [];
            csvRows.push("\uFEFFNo;Nama Siswa;NISN;Kehadiran (Hadir);Sampah (Kg);Kunjungan Perpus;Jumlah Ekskul;Detail Ekskul & Presensi Rapor");
            students.forEach((s, idx) => {
              const details = s.extracurricular_details ?? [];
              const detailStr = details.length > 0
                ? details.map(d => d.total > 0 ? `${d.name} (${d.percentage}% - ${d.predicate} [${d.attended}/${d.total} sesi])` : `${d.name} (${d.predicate})`).join("; ")
                : (s.extracurriculars && s.extracurriculars.length > 0 ? s.extracurriculars.join("; ") : "-");
              csvRows.push(`${idx + 1};"${(s.full_name || '').replaceAll('"', '""')}";"${s.nisn}";${s.attendance_count};${s.waste_kg.toFixed(1)};${s.library_visits};${details.length || s.extracurriculars?.length || 0};"${detailStr.replaceAll('"', '""')}"`);
            });
            const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `Laporan_Wali_Kelas_${className.replace(/\s+/g, '_')}_${period.replace(/\s+/g, '_')}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          });

          document.getElementById("do-print")?.addEventListener("click", () => {
            const printArea = document.getElementById("printable-area")!.innerHTML;
            const w = window.open("", "_blank");
            if (w) {
              w.document.write(`<!DOCTYPE html><html><head><title>Laporan Wali Kelas ${className}</title><style>
                body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; color: #111; line-height: 1.4; }
                table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.85rem; }
                th, td { border: 1px solid #ccc; padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
                th { background: #f4f6f4; font-weight: 700; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.04em; }
                tr { page-break-inside: avoid; }
                .report-summary-bar { display: flex; gap: 1.5rem; background: #f8faf8; border: 1px solid #ddd; padding: 0.75rem 1rem; border-radius: 6px; margin: 1rem 0; font-size: 0.8rem; }
                .report-summary-item { display: flex; flex-direction: column; }
                .report-summary-item span { font-size: 0.65rem; color: #666; text-transform: uppercase; font-weight: 700; }
                .report-summary-item strong { font-size: 1rem; color: #111; margin-top: 2px; }
                .ekskul-pill-container { display: flex; flex-wrap: wrap; gap: 0.25rem; }
                .ekskul-pill { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 99px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
                .ekskul-pill.sangat-baik { background: #eef7d5; color: #1e3b2b; border: 1px solid #c4e373; }
                .ekskul-pill.baik { background: #e3f2fd; color: #0d47a1; border: 1px solid #90caf9; }
                .ekskul-pill.cukup { background: #fff3e0; color: #e65100; border: 1px solid #ffb74d; }
                .ekskul-pill.kurang { background: #ffebee; color: #b71c1c; border: 1px solid #ef9a9a; }
                .ekskul-pill-none { color: #888; font-style: italic; }
                .signature-section { display: flex; justify-content: space-between; margin-top: 3rem; page-break-inside: avoid; font-size: 0.85rem; }
                .signature-box { width: 220px; text-align: center; }
                .signature-space { height: 60px; }
                @media print { body { padding: 0; } }
              </style></head><body>
                ${printArea}
                <div style="margin-top:1.5rem;font-size:0.75rem;color:#555;background:#f9f9f9;padding:0.6rem 0.8rem;border-radius:4px;border:1px solid #eee;">
                  <strong>Keterangan Predikat Keaktifan Ekskul:</strong>
                  <span style="color:#1e3b2b;font-weight:600;margin-left:0.5rem;">● Sangat Baik (&ge;90%)</span>
                  <span style="color:#0d47a1;font-weight:600;margin-left:0.5rem;">● Baik (75-89%)</span>
                  <span style="color:#e65100;font-weight:600;margin-left:0.5rem;">● Cukup (60-74%)</span>
                  <span style="color:#b71c1c;font-weight:600;margin-left:0.5rem;">● Kurang (&lt;60%)</span>
                </div>
                <div class="signature-section">
                  <div class="signature-box">
                    <p>Mengetahui,<br/>Kepala Sekolah</p>
                    <div class="signature-space"></div>
                    <p><strong>( ________________________ )</strong><br/>NIP. ........................................</p>
                  </div>
                  <div class="signature-box">
                    <p>Wali Kelas <strong>${escapeHtml(className)}</strong></p>
                    <div class="signature-space"></div>
                    <p><strong>( ________________________ )</strong><br/>NIP. ........................................</p>
                  </div>
                </div>
              </body></html>`);
              w.document.close();
              w.print();
            }
          });
        } catch (error) { content.innerHTML = errorState(error); }
      });
    });
  } catch (error) { shell(errorState(error), "Laporan Wali Kelas", "Rekapitulasi data siswa per kelas."); }
}

function placeholderPage(title: string): void { shell(`<section class="panel coming-soon"><span>◇</span><h2>${escapeHtml(title)} sedang dipersiapkan</h2><p>Fondasi API dan navigasi sudah tersedia. Modul ini akan diaktifkan pada fase berikutnya.</p><a href="/" data-link class="button secondary">Kembali ke ringkasan</a></section>`, title, "Entry point modul AKSIS berikutnya."); }

async function pwaPortalsPage() {
  getApp().innerHTML = skeleton();
  try {
    const schoolId = state.school!.id;
    const [classesRes, firstStudents] = await Promise.all([
      api<SchoolClass[]>("/classes/summary"), api<Student[]>("/students?page=1&page_size=500")
    ]);
    const classes = [...(classesRes.data ?? [])].sort((a, b) => {
      const gA = a.grade_level ?? 0;
      const gB = b.grade_level ?? 0;
      if (gA !== gB) return gA - gB;
      return a.name.localeCompare(b.name, "id", { numeric: true, sensitivity: "base" });
    });
    const students = [...firstStudents.data];
    const total = firstStudents.meta?.total ?? students.length;
    for (let page = 2; students.length < total; page++) {
      const result = await api<Student[]>(`/students?page=${page}&page_size=500`);
      if (!result.data.length) break;
      students.push(...result.data);
    }
    const definitions = [
      { key: "waste", role: "WASTE_STAFF", name: "Piket Bank Sampah", icon: "♻", description: "Satu QR untuk piket dan setoran siswa di kelas yang dipilih.", port: 4175 },
      { key: "library", role: "LIBRARY_STAFF", name: "Perpustakaan", icon: "▤", description: "Langsung buka terminal pencatatan kunjungan perpustakaan sekolah.", port: 4177 },
      { key: "extracurricular", role: "TEACHER", name: "Ekstrakurikuler", icon: "☆", description: "Akses kegiatan, sesi, dan presensi ekstrakurikuler sekolah.", port: 4176 },
      { key: "parent", role: "PARENT", name: "Portal Orang Tua", icon: "♡", description: "Satu QR sekolah untuk semua orang tua. Wali mencari data anak dengan NISN & Tgl Lahir.", port: 4174 }
    ];
    shell(`<section class="panel portal-intro"><div><span class="eyebrow">AKSES TANPA USERNAME & PASSWORD</span><h2>Satu kali pindai, selanjutnya tinggal buka.</h2><p>Buat QR portal, bagikan kepada pengguna, lalu simpan aplikasi ke layar utama smartphone.</p></div><ol><li><span>1</span> Buat QR portal</li><li><span>2</span> Pindai kamera</li><li><span>3</span> Simpan di HP</li></ol></section>
      <section class="qr-grid">${definitions.map(d => `<article class="qr-card" id="card-${d.key}">
        <div class="qr-card-head">
          <div class="portal-icon">${d.icon}</div>
          <div class="qr-header">
            <h3>${d.name}</h3>
            <p>${d.description}</p>
          </div>
        </div>
        <div class="qr-scope-container">
          ${d.key === "waste" ? `<label class="no-print">Lingkup Kelas<select id="scope-waste"><option value="">Pilih kelas…</option>${classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></label>` : ""}
        </div>
        <div class="qr-container" id="qr-${d.key}">
          <div class="qr-placeholder-content">
            <span class="qr-placeholder-icon">📱</span>
            <p class="qr-placeholder-text">${d.key === "waste" ? "Pilih kelas & buat QR akses" : "Klik tombol di bawah untuk membuat QR akses baru"}</p>
          </div>
        </div>
        <p class="portal-feedback no-print" id="feedback-${d.key}" role="status"></p>
        <button class="button primary wide no-print" id="generate-${d.key}">Buat QR akses</button>
        <div class="portal-actions no-print" id="actions-${d.key}" hidden></div>
      </article>`).join("")}</section>
      <section class="panel" style="margin-top:24px"><div class="panel-head"><div><h2>Akses portal yang diterbitkan</h2><p>QR berlaku sampai dinonaktifkan. Setiap orang yang memegang QR dapat membuka portal. <b>Demi keamanan (enkripsi searah), QR tidak dapat ditampilkan ulang.</b> Jika hilang, hapus dan buat QR baru.</p></div></div><div id="portal-access-list">Memuat akses…</div></section>`,
      "Portal PWA & QR", "Kelola pintu masuk aplikasi sekolah tanpa akun dan password pengguna.");
    const configured: Record<string, string | undefined> = {
      waste: import.meta.env.VITE_WASTE_URL, library: import.meta.env.VITE_LIBRARY_URL,
      extracurricular: import.meta.env.VITE_EXTRACURRICULAR_URL, parent: import.meta.env.VITE_PARENT_URL
    };
    const loadAccess = async () => {
      const container = document.getElementById("portal-access-list"); if (!container) return;
      try {
        const result = await api<Array<{ id: string; role_code: string; metadata: { class_id?: string; student_id?: string }; created_at: string; revoked_at: string | null }>>(`/auth/qr?school_id=${schoolId}`);
        container.innerHTML = result.data.length ? `<div class="table-wrap"><table><thead><tr><th>Portal</th><th>Lingkup</th><th>Dibuat</th><th>Status</th><th></th></tr></thead><tbody>${result.data.map(q => {
          const scope = classes.find(c => c.id === q.metadata?.class_id)?.name ?? students.find(s => s.id === q.metadata?.student_id)?.full_name ?? state.school!.name;
          const statusBadge = q.revoked_at ? `<span class="status neutral">Nonaktif</span>` : `<span class="status success">● Aktif</span>`;
          return `<tr><td><strong>${escapeHtml(definitions.find(d => d.role === q.role_code)?.name ?? q.role_code)}</strong></td><td>${escapeHtml(scope)}</td><td>${escapeHtml(new Date(q.created_at).toLocaleDateString("id-ID"))}</td><td>${statusBadge}</td><td>${q.revoked_at ? "" : `<button class="button secondary" data-revoke="${q.id}">Nonaktifkan</button>`}<button class="button danger" style="margin-left: 8px;" data-hard-delete="${q.id}">Hapus</button></td></tr>`;
        }).join("")}</tbody></table></div>` : `<p>Belum ada QR diterbitkan untuk sekolah ini.</p>`;
        container.querySelectorAll<HTMLButtonElement>("[data-revoke]").forEach(button => {
          button.onclick = async () => {
            const row = button.closest("tr");
            const reinsert = row ? removeRowOptimistic(row as HTMLTableRowElement) : () => {};
            await optimistic({
              apply: () => { button.disabled = true; },
              mutation: () => api(`/auth/qr/${button.dataset.revoke}`, { method: "DELETE" }),
              rollback: () => { reinsert(); button.disabled = false; },
              revalidate: () => loadAccess(),
              successMessage: "Akses portal berhasil dinonaktifkan.",
              errorPrefix: "Gagal menonaktifkan akses"
            });
          };
        });
        container.querySelectorAll<HTMLButtonElement>("[data-hard-delete]").forEach(button => {
          button.onclick = async () => {
            if (!confirm("Apakah Anda yakin ingin menghapus akses ini secara permanen? Data yang berkaitan dengan sesi ini akan ikut terhapus.")) return;
            const row = button.closest("tr");
            const reinsert = row ? removeRowOptimistic(row as HTMLTableRowElement) : () => {};
            await optimistic({
              apply: () => { button.disabled = true; },
              mutation: () => api(`/auth/qr/${button.dataset.hardDelete}/hard`, { method: "DELETE" }),
              rollback: () => { reinsert(); button.disabled = false; },
              revalidate: () => loadAccess(),
              successMessage: "Akses portal berhasil dihapus secara permanen.",
              errorPrefix: "Gagal menghapus akses"
            });
          };
        });
      } catch (error) { container.textContent = error instanceof Error ? error.message : "Daftar akses belum tersedia"; }
    };
    for (const definition of definitions) {
      const d = definition;
      const button = document.getElementById(`generate-${d.key}`) as HTMLButtonElement;
      const select = document.getElementById(`scope-${d.key}`) as HTMLSelectElement | null;
      const feedback = document.getElementById(`feedback-${d.key}`)!;
      const container = document.getElementById(`qr-${d.key}`)!;
      const actions = document.getElementById(`actions-${d.key}`)!;
      let revision = 0;
      if (select) {
        button.disabled = !select.value;
        select.onchange = () => { revision++; button.disabled = !select.value; container.innerHTML = `<div class="qr-placeholder-content"><span class="qr-placeholder-icon">📱</span><p class="qr-placeholder-text">Pilih kelas & buat QR akses</p></div>`; actions.hidden = true; feedback.textContent = ""; };
      }
      button.onclick = async () => {
        const current = ++revision;
        const metadata = d.key === "waste" ? { class_id: select!.value } : {};
        const label = select?.selectedOptions[0]?.textContent ?? state.school!.name;
        button.disabled = true; feedback.textContent = "Menyiapkan akses portal…";
        try {
          const result = await api<{ id: string; token: string }>("/auth/qr/generate", { method: "POST", body: JSON.stringify({ school_id: schoolId, role_code: d.role, metadata }) });
          const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.') || location.hostname.startsWith('10.') || location.hostname.startsWith('172.');
          const base = configured[d.key] || (isDev ? `${location.protocol}//${location.hostname}:${d.port}/` : `${location.origin}/${d.key}/`);
          const url = new URL(base); url.hash = new URLSearchParams({ token: result.data.token }).toString();
          // @ts-ignore
          const QRCode = (await import("qrcode/lib/browser.js")).default;
          const dataUrl = await QRCode.toDataURL(url.toString(), { width: 320, margin: 4, errorCorrectionLevel: "M" });
          await loadAccess();
          if (revision !== current || state.school?.id !== schoolId) return;
          container.innerHTML = `<div class="qr-print-wrapper"><img src="${dataUrl}" width="135" height="135" alt="QR akses ${d.name}"/><div class="qr-label"><strong>${escapeHtml(state.school!.name)}</strong><p>${escapeHtml(d.name)}${d.key === "waste" ? " (" + escapeHtml(label) + ")" : ""}</p></div><div class="qr-print-instructions"><strong style="font-size:0.9rem; color:#0f172a; display:block; margin-bottom:0.4rem; text-align:left;">Panduan Akses Portal:</strong><ol style="margin:0; padding-left:1.2rem; font-size:0.85rem; color:#334155; line-height:1.6; text-align:left;"><li>Pindai Kode QR di atas menggunakan kamera smartphone.</li><li>Buka tautan portal yang muncul di layar.</li><li>Simpan aplikasi ke Layar Utama (Add to Home Screen) untuk akses cepat tanpa kata sandi.</li></ol></div></div>`;
          feedback.textContent = "✓ QR Siap digunakan. Unduh atau cetak sebelum meninggalkan halaman.";
          actions.replaceChildren(); actions.hidden = false;
          const download = document.createElement("a"); download.className = "button secondary"; download.href = dataUrl; download.download = `aksis-${d.key}.png`; download.textContent = "📥 Unduh";
          const print = document.createElement("button"); print.className = "button secondary"; print.textContent = "🖨️ Cetak";
          print.onclick = () => { const card = document.getElementById(`card-${d.key}`)!; card.classList.add("print-active"); window.print(); card.classList.remove("print-active"); };
          const open = document.createElement("a"); open.className = "button secondary"; open.href = url.toString(); open.target = "_blank"; open.rel = "noopener noreferrer"; open.textContent = "↗ Buka";
          actions.append(download, print, open);
        } catch (error) { if (revision === current) feedback.textContent = error instanceof Error ? error.message : "QR belum berhasil dibuat. Coba kembali."; }
        finally { if (revision === current) { button.disabled = Boolean(select && !select.value); button.textContent = "Buat QR baru"; } }
      };
    }
    await loadAccess();
  } catch (error) { shell(errorState(error), "Portal PWA & QR", "Gagal memuat portal"); }
}

export async function render(): Promise<void> {
  clearDashboard();
  try {
    const currentPath = location.pathname;

    // Public / Unauthenticated routing
    if (!getSession()) {
      if (currentPath === "/login") {
        loginView();
        return;
      }
      renderLandingPage(navigate);
      return;
    }

    // If logged in and visits /landing explicitly, show landing page
    if (currentPath === "/landing") {
      renderLandingPage(navigate);
      return;
    }

    try { if (!state.school || !state.context) await bootstrap(); } catch { clearSession(); loginView(); return; }

    let path = currentPath === "/login" ? "/" : currentPath;
    if (state.context?.roles.includes("SUPER_ADMIN") && !isPlatformRoute(path)) {
      history.replaceState({}, "", "/platform");
      path = "/platform";
    }

    if (!canAccess(path, state.context?.permissions ?? [], state.context?.roles ?? [])) {
      if (isPlatformRoute(path)) {
        navigate("/");
        return;
      }
      shell(`<section class="state-card state-error"><span>!</span><div><strong>Akses dibatasi</strong><p>Peran Anda tidak memiliki izin untuk membuka modul ini.</p></div></section>`, "Akses dibatasi", "Hubungi admin sekolah bila Anda memerlukan akses.");
      return;
    }

    if (isPlatformRoute(path)) { await mountPlatformPage(path, state.allSchools ?? [], shell, navigate); }
    else if (path === "/") await dashboardPage();
    else if (path === "/students") await studentsPage();
    else if (path === "/academic-years") await academicYearsPage();
    else if (path === "/attendance") await attendancePage();
    else if (path === "/cards") await cardsPage();
    else if (path === "/devices") await devicesPage();
    else if (path === "/student-import") studentImportPage();
    else if (path === "/class-promotion") classPromotionPage();
    else if (path === "/waste") await wastePage();
    else if (path === "/library") await libraryPage();
    else if (path === "/extracurricular") await extracurricularPage();
    else if (path === "/led") await ledPage();
    else if (path === "/pwa-portals") await pwaPortalsPage();
    else if (path === "/reports") await reportsPage();
    else placeholderPage(navItems.find(([route]) => route === path)?.[1] ?? "Halaman");
  } catch (err) {
    console.error("Render error:", err);
    getApp().innerHTML = errorState(err);
  }
}

window.addEventListener("popstate", () => void render());
window.addEventListener("aksis:session-expired", () => loginView());
