import { ApiClientError, api, login } from "./lib/api";
import { canAccess } from "./lib/permissions";
import { clearSession, getSchoolId, getSession, setSchoolId, setSession } from "./lib/session";
import type { Attendance, AuthContext, Card, Device, School, SchoolClass, Student } from "./lib/types";

type AppState = {
  school?: School;
  context?: AuthContext;
  userEmail?: string;
};

const state: AppState = {};
const app = document.querySelector<HTMLDivElement>("#app")!;
const navItems = [
  ["/", "Ringkasan", "⌂"], ["/students", "Siswa", "◎"], ["/student-import", "Import siswa", "↥"],
  ["/classes", "Kelas", "▦"], ["/attendance", "Kehadiran", "✓"], ["/cards", "Kartu siswa", "▰"],
  ["/devices", "Perangkat", "⌁"], ["/waste", "Bank sampah", "♻"], ["/library", "Perpustakaan", "▤"],
  ["/extracurricular", "Ekstrakurikuler", "☆"], ["/led", "LED board", "▱"], ["/reports", "Laporan", "↗"]
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
  app.innerHTML = `<main class="login-page" id="main-content">
    <section class="login-story" aria-label="Tentang AKSIS">
      <div class="brand brand-light"><span class="brand-mark">A</span><span>AKSIS</span></div>
      <div><p class="eyebrow">Administrasi sekolah, terhubung</p><h1>Satu ruang kerja untuk hari sekolah yang lebih tertata.</h1>
      <p class="story-copy">Kelola siswa, kehadiran, kartu, dan perangkat dari satu portal yang aman.</p></div>
      <blockquote>“Data yang jelas membantu sekolah mengambil keputusan yang lebih baik.”</blockquote>
    </section>
    <section class="login-panel">
      <form class="login-form" id="login-form">
        <div><p class="eyebrow dark">Portal Admin</p><h2>Selamat datang kembali</h2><p>Masuk menggunakan akun sekolah Anda.</p></div>
        <div id="login-error" aria-live="polite"></div>
        <label>Email<input name="email" type="email" autocomplete="username" placeholder="admin@sekolah.sch.id" required /></label>
        <label>Kata sandi<input name="password" type="password" autocomplete="current-password" minlength="8" placeholder="Minimal 8 karakter" required /></label>
        <button class="button primary wide" type="submit">Masuk ke AKSIS <span>→</span></button>
        <small>Sesi disimpan hanya selama tab browser aktif. AKSIS tidak pernah menyimpan service-role key di browser.</small>
      </form>
    </section>
  </main>`;
  document.querySelector<HTMLFormElement>("#login-form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>("button")!;
    const data = new FormData(form);
    button.disabled = true; button.textContent = "Memverifikasi…";
    try {
      const result = await login(String(data.get("email")), String(data.get("password")));
      if (!result.data.schools.length) throw new ApiClientError("FORBIDDEN", "Akun belum terhubung ke sekolah aktif.", 403);
      setSession(result.data.session);
      setSchoolId(result.data.schools[0]!.school_id);
      state.userEmail = result.data.user.email;
      await bootstrap();
      navigate("/");
    } catch (error) {
      document.querySelector("#login-error")!.innerHTML = errorState(error);
    } finally { button.disabled = false; button.textContent = "Masuk ke AKSIS →"; }
  });
}

async function bootstrap(): Promise<void> {
  const [school, context] = await Promise.all([
    api<School>("/schools/current"), api<AuthContext>("/schools/current/context")
  ]);
  state.school = school.data;
  state.context = context.data;
}

function shell(content: string, title: string, subtitle: string): void {
  const path = location.pathname;
  const initials = (state.school?.name ?? "AKSIS").split(" ").slice(0, 2).map((part) => part[0]).join("");
  const visibleNav = navItems.filter(([route]) => canAccess(route, state.context?.permissions ?? []));
  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><span class="brand-mark">A</span><span>AKSIS</span></div>
      <nav aria-label="Navigasi utama">${visibleNav.map(([route, label, icon]) => `<a href="${route}" data-link class="${path === route ? "active" : ""}"><span>${icon}</span>${label}</a>`).join("")}</nav>
      <div class="sidebar-foot"><span class="status-dot"></span><div><strong>Sistem aktif</strong><small>Semua layanan normal</small></div></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><button class="icon-button menu-button" data-action="menu" aria-label="Buka navigasi">☰</button>
        <div class="school-switch"><span class="school-avatar">${escapeHtml(initials)}</span><div><small>Sekolah aktif</small><strong>${escapeHtml(state.school?.name)}</strong></div></div>
        <div class="top-actions"><button class="icon-button" aria-label="Notifikasi">○</button><div class="profile"><span>${escapeHtml(initials)}</span><div><strong>${escapeHtml(state.userEmail ?? "Admin Sekolah")}</strong><small>${escapeHtml(state.context?.roles[0] ?? "SCHOOL_ADMIN")}</small></div></div><button class="icon-button" data-action="logout" aria-label="Keluar">↪</button></div>
      </header>
      <main class="content" id="main-content"><div class="page-heading"><div><p class="eyebrow dark">${escapeHtml(state.school?.code ?? "SEKOLAH")}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><span class="date-chip">${new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span></div>${content}</main>
    </div><div class="sidebar-scrim" data-action="menu"></div></div>`;
  bindShellEvents();
}

function bindShellEvents(): void {
  document.querySelectorAll<HTMLElement>("[data-link]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault(); navigate(link.getAttribute("href")!);
  }));
  document.querySelectorAll<HTMLElement>("[data-action='menu']").forEach((button) => button.addEventListener("click", () => document.body.classList.toggle("nav-open")));
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
  shell(`<section class="stats-grid">${Array.from({ length: 4 }, () => skeleton(1)).join("")}</section><section class="dashboard-grid"><div class="panel">${skeleton()}</div><div class="panel">${skeleton()}</div></section>`, "Ringkasan sekolah", "Pantau aktivitas utama sekolah hari ini.");
  try {
    const allowed = state.context?.permissions ?? [];
    const [students, classes, cards, devices, attendance] = await Promise.all([
      allowed.includes("student.read") ? api<Student[]>("/students?page=1&page_size=5") : null,
      api<SchoolClass[]>("/classes?page=1&page_size=1"),
      allowed.includes("card.read") ? api<Card[]>("/cards?page=1&page_size=1") : null,
      allowed.includes("device.read") ? api<Device[]>("/devices?page=1&page_size=8") : null,
      allowed.includes("attendance.read") ? api<Attendance[]>("/attendance?page=1&page_size=6") : null
    ]);
    const online = devices?.data.filter((device) => device.last_seen_at && Date.now() - new Date(device.last_seen_at).getTime() < 5 * 60_000).length ?? 0;
    const late = attendance?.data.filter((item) => item.is_late).length ?? 0;
    const stats = [
      ["Total siswa", students?.meta?.total ?? "—", "Data siswa aktif", "sage"],
      ["Kehadiran terbaru", attendance?.meta?.total ?? "—", `${late} terlambat pada daftar ini`, "lime"],
      ["Kelas", classes.meta?.total ?? 0, "Tahun ajaran berjalan", "blue"],
      ["Perangkat online", `${online}/${devices?.meta?.total ?? 0}`, "Aktif 5 menit terakhir", "sand"]
    ];
    const attendanceRows = attendance?.data.map((item) => { const student = relation(item.students); const klass = relation(item.classes); return `<tr><td><strong>${escapeHtml(student?.full_name ?? "Siswa")}</strong><small>${escapeHtml(student?.student_number)}</small></td><td>${escapeHtml(klass?.name ?? "—")}</td><td><span class="status ${item.direction === "CHECK_IN" ? "success" : "neutral"}">${item.direction === "CHECK_IN" ? "Masuk" : "Pulang"}</span></td><td>${formatTime(item.occurred_at_local)}</td></tr>`; }).join("") ?? "";
    const deviceCards = devices?.data.map((device) => { const isOnline = Boolean(device.last_seen_at && Date.now() - new Date(device.last_seen_at).getTime() < 5 * 60_000); return `<div class="device-row"><span class="device-icon">${device.device_type.slice(0, 1)}</span><div><strong>${escapeHtml(device.name)}</strong><small>${escapeHtml(device.location ?? device.device_code)}</small></div><span class="status ${isOnline ? "success" : "neutral"}">${isOnline ? "Online" : "Offline"}</span></div>`; }).join("") ?? "";
    shell(`<section class="stats-grid">${stats.map(([label, value, note, color]) => `<article class="stat-card ${color}"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div><span class="trend">↗</span></article>`).join("")}</section>
      <section class="quick-actions"><strong>Aksi cepat</strong><div><a href="/students" data-link>◎ Kelola siswa</a><a href="/student-import" data-link>↥ Import data</a><a href="/cards" data-link>▰ Kelola kartu</a><a href="/devices" data-link>⌁ Cek perangkat</a></div></section>
      <section class="dashboard-grid"><article class="panel span-2"><div class="panel-head"><div><h2>Aktivitas gerbang</h2><p>Presensi terbaru dari perangkat sekolah</p></div><a href="/attendance" data-link>Lihat semua →</a></div>${attendanceRows ? `<div class="table-wrap"><table><thead><tr><th>Siswa</th><th>Kelas</th><th>Status</th><th>Waktu</th></tr></thead><tbody>${attendanceRows}</tbody></table></div>` : emptyState("Belum ada aktivitas", "Tap kartu akan muncul di sini secara otomatis.")}</article>
      <article class="panel"><div class="panel-head"><div><h2>Status perangkat</h2><p>Pembaruan 5 menit terakhir</p></div></div>${deviceCards || emptyState("Belum ada perangkat", "Daftarkan perangkat sekolah melalui menu perangkat.")}</article></section>`, "Ringkasan sekolah", "Pantau aktivitas utama sekolah hari ini.");
  } catch (error) { shell(errorState(error), "Ringkasan sekolah", "Pantau aktivitas utama sekolah hari ini."); }
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

function studentsPage(): void { tablePage<Student>({ title: "Data siswa", subtitle: "Kelola identitas siswa tanpa mengubah histori akademik.", path: "/students", action: { label: "↥ Import siswa", href: "/student-import" }, columns: ["Siswa", "NISN", "Gender", "Status"], row: (item) => `<tr><td><strong>${escapeHtml(item.full_name)}</strong><small>${escapeHtml(item.student_number)}</small></td><td>${escapeHtml(item.nisn ?? "—")}</td><td>${escapeHtml(item.gender)}</td><td><span class="status ${item.is_active ? "success" : "neutral"}">${item.is_active ? "Aktif" : "Nonaktif"}</span></td></tr>` }); }
function classesPage(): void { tablePage<SchoolClass>({ title: "Kelas", subtitle: "Struktur kelas pada tahun ajaran aktif.", path: "/classes", columns: ["Kode", "Nama kelas", "Tingkat", "Status"], row: (item) => `<tr><td>${escapeHtml(item.code)}</td><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.grade_level ?? "—")}</td><td><span class="status ${item.is_active ? "success" : "neutral"}">${item.is_active ? "Aktif" : "Nonaktif"}</span></td></tr>` }); }
function cardsPage(): void { tablePage<Card>({ title: "Kartu siswa", subtitle: "Pantau identitas kartu dan status lifecycle-nya.", path: "/cards", columns: ["Nomor seri", "UID", "Status", "Kedaluwarsa"], row: (item) => `<tr><td><strong>${escapeHtml(item.card_serial)}</strong></td><td><code>${escapeHtml(item.card_uid)}</code></td><td><span class="status ${item.status === "ACTIVE" ? "success" : "warning"}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.expires_at ? new Date(item.expires_at).toLocaleDateString("id-ID") : "—")}</td></tr>` }); }
function devicesPage(): void { tablePage<Device>({ title: "Perangkat", subtitle: "Status gate, terminal, LED, dan card station sekolah.", path: "/devices", columns: ["Perangkat", "Tipe", "Firmware", "Status", "Terakhir aktif"], row: (item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.device_code)} · ${escapeHtml(item.location ?? "—")}</small></td><td>${escapeHtml(item.device_type)}</td><td>${escapeHtml(item.firmware_version ?? "—")}</td><td><span class="status ${item.status === "ACTIVE" ? "success" : "warning"}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.last_seen_at ? formatTime(item.last_seen_at) : "Belum pernah")}</td></tr>` }); }
function attendancePage(): void { tablePage<Attendance>({ title: "Kehadiran", subtitle: "Log presensi gerbang yang sudah tervalidasi dan idempotent.", path: "/attendance", columns: ["Siswa", "Kelas", "Arah", "Waktu", "Keterangan"], row: (item) => { const student = relation(item.students); return `<tr><td><strong>${escapeHtml(student?.full_name ?? "Siswa")}</strong><small>${escapeHtml(student?.student_number)}</small></td><td>${escapeHtml(relation(item.classes)?.name ?? "—")}</td><td>${item.direction === "CHECK_IN" ? "Masuk" : "Pulang"}</td><td>${formatTime(item.occurred_at_local)}</td><td><span class="status ${item.is_late ? "warning" : "success"}">${item.is_late ? "Terlambat" : "Tepat waktu"}</span></td></tr>`; } }); }

function placeholderPage(title: string): void { shell(`<section class="panel coming-soon"><span>◇</span><h2>${escapeHtml(title)} sedang dipersiapkan</h2><p>Fondasi API dan navigasi sudah tersedia. Modul ini akan diaktifkan pada fase berikutnya.</p><a href="/" data-link class="button secondary">Kembali ke ringkasan</a></section>`, title, "Entry point modul AKSIS berikutnya."); }

export async function render(): Promise<void> {
  if (!getSession()) { loginView(); return; }
  try { if (!state.school || !state.context) await bootstrap(); } catch { clearSession(); loginView(); return; }
  const path = location.pathname;
  if (!canAccess(path, state.context?.permissions ?? [])) { shell(`<section class="state-card state-error"><span>!</span><div><strong>Akses dibatasi</strong><p>Peran Anda tidak memiliki izin untuk membuka modul ini.</p></div></section>`, "Akses dibatasi", "Hubungi admin sekolah bila Anda memerlukan akses."); return; }
  if (path === "/") await dashboardPage();
  else if (path === "/students") studentsPage();
  else if (path === "/classes") classesPage();
  else if (path === "/attendance") attendancePage();
  else if (path === "/cards") cardsPage();
  else if (path === "/devices") devicesPage();
  else placeholderPage(navItems.find(([route]) => route === path)?.[1] ?? "Halaman");
}

window.addEventListener("popstate", () => void render());
window.addEventListener("aksis:session-expired", () => loginView());
