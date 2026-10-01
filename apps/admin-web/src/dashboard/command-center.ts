import { api } from "../lib/api";
import { getSchoolId } from "../lib/session";
import type { Device, School } from "../lib/types";
import { freshness, online, type Snapshot } from "./model";
import "./command-center.css";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const number = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
type ClassRank = { class_id: string; name: string; value: number; rank: number };
type SupportGroup = { total: number; zero_count: number; rows: { student_id: string; name: string; class_name: string; value: number }[] };
type Support = { school_id: string; period_start: string; period_end: string; generated_at: string; students_count: number; late: SupportGroup; waste: SupportGroup; library: SupportGroup };
type Rankings = { school_id: string; date: string; timezone: string; generated_at: string; arrivals: { student_id: string; name: string; class_name: string; at: string; rank: number }[]; waste: ClassRank[]; library: ClassRank[] };
const weight = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value);
const expandIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>`;
const icons = ["M5 12l4 4L19 6", "M12 3l7 12H5L12 3zm-7 12-2 4h18l-2-4", "M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3V5zM12 7v14", "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"];
const empty = (text: string) => `<div class="cc-empty"><span>◌</span><p>${esc(text)}</p></div>`;

type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };
export function mountCommandCenter(root: HTMLElement, options: { school: School; permissions: string[]; roles: string[]; navigate: (path: string) => void }): () => void {
  let disposed = false, busy = false, tv = false, native = false, failed = false;
  let snapshot: Snapshot | null = null, rankings: Rankings | null = null;
  let rankingFailed = false;
  let support: Support | null = null, supportFailed = false;
  let devices: Device[] = [];
  let deviceTotal = 0, deviceError = false;
  let wakeLock: WakeLockSentinel | null = null;
  const lifetime = new AbortController();
  let requestController: AbortController | null = null;
  let lastSuccess: number | null = null;
  const allowed = (permission: string) => options.roles.some(r => ["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(r)) || options.permissions.includes(permission);
  const valid = () => !disposed && root.isConnected && getSchoolId() === options.school.id;
  const zone = () => snapshot?.timezone ?? options.school.timezone ?? "Asia/Makassar";
  const time = (value: string | number) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: zone() }).format(new Date(value));
  root.classList.add("cc");
  root.innerHTML = `<header class="cc-header"><div class="cc-identity"><img src="/icon.svg" class="cc-brand" alt="AKSIS Logo" /><div><span class="cc-eyebrow">AKSIS • SCHOOL OPERATIONS</span><h2>Command Center</h2><p>${esc(options.school.name)}</p></div></div><div class="cc-header-right"><div class="cc-time"><strong data-cc="clock">—</strong><span data-cc="date"></span></div><button class="cc-tv-button" type="button" aria-pressed="false">${expandIcon}<span>Mode Layar TV</span></button></div></header>
    <div class="cc-kpis" data-cc="kpis">${Array.from({ length: 4 }, () => `<div class="cc-card cc-placeholder">Memuat metrik…</div>`).join("")}</div>
    <div class="cc-competition">
      <section class="cc-card cc-arrivals"><div class="cc-card-heading"><div><span class="cc-eyebrow">DISIPLIN DIMULAI DARI DIRI</span><h3>Langkah paling awal</h3></div><span class="cc-medallion">◷</span></div><p class="cc-description">5 siswa paling awal hadir hari ini</p><div data-cc="arrivals" class="cc-ranking-content">${empty("Memuat urutan kehadiran…")}</div><p class="cc-ranking-rule">Tap masuk pertama setiap siswa · waktu sekolah</p></section>
      <section class="cc-card cc-podium-card cc-waste-rank"><div class="cc-card-heading"><div><span class="cc-eyebrow">KELAS PEDULI LINGKUNGAN</span><h3>Juara bank sampah</h3></div><span class="cc-medallion">♻</span></div><p class="cc-description">3 kelas dengan setoran terbanyak hari ini</p><div data-cc="waste-ranking" class="cc-ranking-content">${empty("Memuat klasemen sampah…")}</div><p class="cc-ranking-rule">Total berat organik + anorganik · kilogram</p></section>
      <section class="cc-card cc-podium-card cc-library-rank"><div class="cc-card-heading"><div><span class="cc-eyebrow">KELAS GEMAR MEMBACA</span><h3>Juara perpustakaan</h3></div><span class="cc-medallion">▤</span></div><p class="cc-description">3 kelas dengan kunjungan terbanyak hari ini</p><div data-cc="library-ranking" class="cc-ranking-content">${empty("Memuat klasemen perpustakaan…")}</div><p class="cc-ranking-rule">Jumlah kunjungan tercatat · bukan pengunjung unik</p></section>
    </div>
    <section class="cc-support"><div class="cc-support-heading"><div><span class="cc-eyebrow">TINDAK LANJUT GURU</span><h3>Prioritas pendampingan <small data-cc="support-period">Bulan berjalan</small></h3></div><div data-cc="devices" class="cc-device-content">Memuat perangkat…</div></div><div class="cc-support-grid">
      <section><h4>Keterlambatan terbanyak <span>hari</span></h4><div data-cc="support-late">${empty("Memuat catatan…")}</div></section>
      <section><h4>Setoran tercatat terendah <span>kg</span></h4><div data-cc="support-waste">${empty("Memuat catatan…")}</div></section>
      <section><h4>Kunjungan terendah <span>kali</span></h4><div data-cc="support-library">${empty("Memuat catatan…")}</div></section>
    </div><p class="cc-support-note" data-cc="support-status">Angka sesuai catatan sistem, bukan penilaian sikap siswa.</p></section>
    <footer class="cc-footer"><div><span class="cc-status" data-cc="status" role="status">Menghubungkan…</span><span data-cc="updated"></span><span data-cc="ranking-status"></span></div><div><span data-cc="fullscreen-note"></span><button type="button" class="cc-refresh">↻ Perbarui</button></div></footer>
    <nav class="cc-shortcuts" aria-label="Aksi cepat"><strong>Aksi cepat</strong>${[["/students", "Kelola siswa", "student.read"], ["/waste", "Bank sampah", "waste.manage"], ["/library", "Perpustakaan", "library.manage"], ["/devices", "Perangkat", "device.read"]].filter(([, , permission]) => allowed(permission!)).map(([path, label]) => `<a href="${path}" data-cc-link>${label} ↗</a>`).join("")}</nav>`;
  const el = (name: string) => root.querySelector<HTMLElement>(`[data-cc="${name}"]`)!;
  const toggle = root.querySelector<HTMLButtonElement>(".cc-tv-button")!;
  const refreshButton = root.querySelector<HTMLButtonElement>(".cc-refresh")!;
  function tick() {
    if (!valid()) return;
    el("clock").textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: zone() }).format(new Date());
    el("date").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: zone() }).format(new Date());
    const state = freshness(snapshot, failed);
    el("status").dataset.state = state;
    el("status").textContent = { loading: "Menghubungkan…", live: "Terhubung", stale: "Menunggu snapshot terbaru", offline: "Koneksi terputus · mencoba kembali" }[state];
    el("updated").textContent = snapshot ? `Data ${snapshot.date} · diperbarui ${time(snapshot.generated_at)}${lastSuccess ? ` · tersinkron ${time(lastSuccess)}` : ""}` : "Data belum tersedia";
  }
  function paintMetrics() {
    if (!snapshot) return;
    const m = snapshot.metrics;
    const cards = [
      ["Siswa tercatat", m.attendance.students, `${number(m.attendance.total)} tap gerbang hari ini`, "lime"],
      ["Bank sampah", m.waste.total_kg, `${number(m.waste.transactions)} transaksi setoran`, "mint"],
      ["Kunjungan pustaka", m.library.visits, `${number(m.library.students)} pengunjung unik`, "peach"],
      ["Presensi ekskul", m.extracurricular.present, `${number(m.extracurricular.recorded)} catatan kehadiran`, "blue"]
    ] as const;
    el("kpis").innerHTML = cards.map(([label, value, note, color], index) => `<article class="cc-kpi cc-${color}"><div><span>${label}</span><svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" fill="none" aria-hidden="true"><path d="${icons[index]}"/></svg></div><strong>${number(value)}${index === 1 ? "<small>kg</small>" : ""}</strong><p>${note}</p></article>`).join("");
  }
  function paintDevices() {
    if (!allowed("device.read")) { el("devices").textContent = "Status perangkat tidak tersedia"; return; }
    if (deviceError) { el("devices").textContent = "Status perangkat belum dapat diperbarui"; return; }
    const active = devices.filter(d => online(d.last_seen_at, d.status)).length;
    el("devices").innerHTML = `<span class="cc-status" data-state="${active ? "live" : "stale"}">${active}/${devices.length} perangkat pada daftar online</span><small>${devices.length} dari ${deviceTotal} perangkat · heartbeat 5 menit</small>`;
  }
  function paintRankings() {
    const targets = ["arrivals", "waste-ranking", "library-ranking"];
    if (!rankings) {
      targets.forEach(key => el(key).innerHTML = empty(rankingFailed ? "Klasemen belum tersedia. Coba perbarui kembali." : "Memuat klasemen…"));
      el("ranking-status").textContent = rankingFailed ? "Klasemen gagal diperbarui" : "Memuat klasemen hari ini…";
      return;
    }
    el("ranking-status").textContent = `${rankingFailed ? "Pembaruan gagal · data terakhir" : "Klasemen"} ${rankings.date} · ${time(rankings.generated_at)} · nilai sama = peringkat sama`;
    const arrivalTime = (value: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: rankings!.timezone }).format(new Date(value));
    el("arrivals").innerHTML = rankings.arrivals.length ? `<ol class="cc-arrival-list">${rankings.arrivals.map((row) => `<li class="${row.rank === 1 ? "cc-first-arrival" : ""}"><span class="cc-place">${row.rank}</span><div><strong>${esc(row.name)}</strong><span>${esc(row.class_name)}${row.rank === 1 ? " · Pelopor hari ini" : ""}</span></div><time>${arrivalTime(row.at)}</time></li>`).join("")}</ol>` : empty("Belum ada siswa tercatat masuk hari ini. Siapa yang akan menjadi pelopor?");
    const podium = (rows: ClassRank[], unit: string) => {
      if (!rows.length) return empty(`Belum ada ${unit === "kg" ? "setoran sampah" : "kunjungan perpustakaan"} hari ini. Ayo mulai kontribusi kelasmu!`);
      const max = rows[0]!.value;
      const format = unit === "kg" ? weight : number;
      const order = rows.length === 1 ? [0] : rows.length === 2 ? [1, 0] : [1, 0, 2];
      return `<div class="cc-winner"><span>★ PEMIMPIN KLASEMEN</span><strong>${rows.filter(r => r.rank === 1).length > 1 ? `${rows.filter(r => r.rank === 1).length} kelas berbagi #1` : esc(rows[0]!.name)}</strong><p>${format(max)} <small>${unit}</small></p></div><div class="cc-podium cc-podium-${rows.length}" role="img" aria-label="${esc(rows.map(r => `Peringkat ${r.rank}: ${r.name}, ${format(r.value)} ${unit}`).join('; '))}">${order.map(index => { const row = rows[index]!; return `<div class="cc-podium-column cc-position-${row.rank - 1}" style="--podium-ratio:${row.rank === 1 ? 1 : row.rank === 2 ? .72 : .48}"><div class="cc-podium-label"><strong>${esc(row.name)}</strong><span>${format(row.value)} <small>${unit}</small></span></div><div class="cc-podium-bar"><b>${row.rank}</b></div></div>`; }).join("")}</div><div class="cc-podium-note">${rows.length < 3 ? `${rows.length} kelas sudah berkontribusi. Masih ada tempat di podium!` : rows[0]!.value === rows[1]!.value ? "Persaingan ketat — pemimpin berbagi peringkat!" : `Selisih dua teratas: ${format(rows[0]!.value - rows[1]!.value)} ${unit}`}</div>`;
    };
    el("waste-ranking").innerHTML = podium(rankings.waste, "kg");
    el("library-ranking").innerHTML = podium(rankings.library, "kunjungan");
  }
  function paintSupport() {
    const groups = ["late", "waste", "library"] as const;
    if (!support) {
      groups.forEach(key => el(`support-${key}`).innerHTML = empty(supportFailed ? "Data pendampingan belum tersedia" : "Memuat catatan…"));
      el("support-status").textContent = supportFailed ? "Data gagal dimuat. Klik Perbarui untuk mencoba kembali." : "Memuat data bulan berjalan…";
      return;
    }
    el("support-period").textContent = `${support.period_start} – ${support.period_end}`;
    groups.forEach(key => {
      const group = support![key];
      el(`support-${key}`).innerHTML = group.rows.length ? `<ol class="cc-support-list">${group.rows.map(row => `<li><div><strong>${esc(row.name)}</strong><small>${esc(row.class_name)}</small></div><b>${key === "waste" ? weight(row.value) : number(row.value)} <small>${key === "late" ? "hari" : key === "waste" ? "kg" : "kali"}</small></b></li>`).join("")}</ol><p class="cc-support-count">${group.rows.length} dari ${group.total} siswa${group.zero_count ? ` · ${group.zero_count} siswa bernilai 0` : ""}</p>` : empty(key === "late" && support!.students_count ? "Tidak ada keterlambatan tercatat bulan ini" : "Belum ada siswa aktif");
    });
    el("support-status").textContent = `${supportFailed ? "Pembaruan gagal · data terakhir" : "Diperbarui"} ${time(support.generated_at)} · nilai sama diurutkan menurut nama · setoran mengikuti siswa pada transaksi; konfirmasi kontribusi kelompok.`;
  }
  async function refresh() {
    if (!valid() || busy) return;
    busy = true; refreshButton.disabled = true;
    requestController = new AbortController();
    const timeout = window.setTimeout(() => requestController?.abort(), 20_000);
    const signal = requestController.signal;
    try {
      const [summaryResult, rankingResult, deviceResult, supportResult] = await Promise.allSettled([
        api<Snapshot>("/dashboard/today", { signal }),
        api<Rankings>("/dashboard/rankings", { signal }),
        allowed("device.read") ? api<Device[]>("/devices?page=1&page_size=5", { signal }) : Promise.resolve(null),
        api<Support>("/dashboard/support", { signal })
      ]);
      if (!valid()) return;
      failed = summaryResult.status === "rejected";
      if (summaryResult.status === "fulfilled" && summaryResult.value.data?.school_id === options.school.id) {
        snapshot = summaryResult.value.data; lastSuccess = Date.now(); paintMetrics();
      } else {
        failed = true;
        if (!snapshot) el("kpis").innerHTML = `<div class="cc-unavailable">Data metrik belum tersedia. Klik Perbarui untuk mencoba kembali.</div>`;
      }
      rankingFailed = rankingResult.status === "rejected";
      if (rankingResult.status === "fulfilled" && rankingResult.value.data?.school_id === options.school.id) rankings = rankingResult.value.data;
      else rankingFailed = true;
      // Never label yesterday's winners as today's when the school day changes.
      const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: zone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (rankings && rankings.date !== currentDate) { rankings = null; rankingFailed = true; }
      deviceError = deviceResult.status === "rejected";
      if (deviceResult.status === "fulfilled") { devices = deviceResult.value?.data ?? []; deviceTotal = deviceResult.value?.meta?.total ?? devices.length; }
      supportFailed = supportResult.status === "rejected";
      if (supportResult.status === "fulfilled" && supportResult.value.data?.school_id === options.school.id) support = supportResult.value.data;
      else supportFailed = true;
      if (support && support.period_end.slice(0, 7) !== currentDate.slice(0, 7)) { support = null; supportFailed = true; }
      paintSupport(); paintRankings(); paintDevices(); tick();
    } catch {
      if (!valid()) return;
      failed = true;
      if (!snapshot) {
        el("kpis").innerHTML = `<div class="cc-unavailable">Data sekolah belum tersedia. Gunakan Perbarui untuk mencoba kembali.</div>`;
        rankingFailed = true; paintRankings();
      }
      tick();
    } finally { window.clearTimeout(timeout); busy = false; if (valid()) refreshButton.disabled = false; }
  }
  async function acquireWakeLock() {
    if (!tv || disposed || document.visibilityState !== "visible" || !("wakeLock" in navigator) || wakeLock) return;
    try { const lock = await navigator.wakeLock.request("screen"); if (!tv || disposed) { await lock.release(); return; } wakeLock = lock; lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; }); } catch { /* Browser/TV controls its own standby policy. */ }
  }
  function setTv(enabled: boolean) {
    tv = enabled; root.classList.toggle("cc-tv", tv); document.body.classList.toggle("cc-tv-open", tv);
    toggle.setAttribute("aria-pressed", String(tv)); toggle.querySelector("span")!.textContent = tv ? "Keluar layar TV" : "Mode Layar TV";
    el("fullscreen-note").textContent = tv ? "Esc / Kembali untuk keluar" : "Pembaruan otomatis 30 detik";
    if (tv) { void acquireWakeLock(); toggle.focus(); }
    else { void wakeLock?.release().catch(() => undefined); wakeLock = null; toggle.focus(); }
  }
  const fullDoc = document as FullscreenDocument;
  const fullscreenElement = () => document.fullscreenElement ?? fullDoc.webkitFullscreenElement;
  async function leave() {
    setTv(false); native = false;
    if (fullscreenElement() === root) {
      try { if (document.exitFullscreen) await document.exitFullscreen(); else fullDoc.webkitExitFullscreen?.(); } catch { /* CSS mode has already closed. */ }
    }
  }
  toggle.onclick = async () => {
    if (tv) { await leave(); return; }
    setTv(true);
    try {
      if (root.requestFullscreen) { await root.requestFullscreen(); native = true; }
      else if ((root as FullscreenElement).webkitRequestFullscreen) { (root as FullscreenElement).webkitRequestFullscreen!(); native = true; }
      else el("fullscreen-note").textContent = "Mode TV aktif · layar penuh browser tidak tersedia";
      if (disposed && fullscreenElement() === root) await document.exitFullscreen();
    } catch { if (!disposed && tv) el("fullscreen-note").textContent = "Mode TV aktif · browser tidak mengizinkan layar penuh"; }
  };
  const fullscreenChanged = () => { if (fullscreenElement() === root) native = true; else if (native) { native = false; if (!disposed) setTv(false); } };
  document.addEventListener("fullscreenchange", fullscreenChanged, { signal: lifetime.signal });
  document.addEventListener("webkitfullscreenchange", fullscreenChanged, { signal: lifetime.signal });
  document.addEventListener("keydown", event => {
    if (tv && ["Escape", "BrowserBack", "GoBack"].includes(event.key)) { event.preventDefault(); void leave(); }
    if (tv && event.key === "Tab") {
      const controls = [toggle, refreshButton].filter(button => !button.disabled);
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus();
    }
    if (tv && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); (document.activeElement === toggle && !refreshButton.disabled ? refreshButton : toggle).focus();
    }
  }, { signal: lifetime.signal });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { void acquireWakeLock(); void refresh(); } }, { signal: lifetime.signal });
  window.addEventListener("online", () => void refresh(), { signal: lifetime.signal });
  root.querySelectorAll<HTMLAnchorElement>("[data-cc-link]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); options.navigate(link.getAttribute("href")!); }, { signal: lifetime.signal }));
  refreshButton.onclick = () => void refresh();
  const clockTimer = window.setInterval(tick, 1000);
  const refreshTimer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
  tick(); void refresh();
  return () => {
    disposed = true; lifetime.abort(); requestController?.abort(); window.clearInterval(clockTimer); window.clearInterval(refreshTimer);
    document.body.classList.remove("cc-tv-open"); root.classList.remove("cc-tv");
    void wakeLock?.release().catch(() => undefined);
    if (fullscreenElement() === root) { if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined); else fullDoc.webkitExitFullscreen?.(); }
  };
}
