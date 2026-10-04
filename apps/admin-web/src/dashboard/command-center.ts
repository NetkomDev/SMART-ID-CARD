import { api } from "../lib/api";
import { getSchoolId } from "../lib/session";
import type { Device, School } from "../lib/types";
import { freshness, online, type Snapshot } from "./model";
import "./command-center.css";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const number = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);
const weight = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);

type ClassRank = { class_id: string; name: string; value: number; rank: number };
type SupportGroup = { total: number; zero_count: number; rows: { student_id: string; name: string; class_name: string; value: number }[] };
type Support = { school_id: string; period_start: string; period_end: string; generated_at: string; students_count: number; late: SupportGroup; waste: SupportGroup; library: SupportGroup };
type Rankings = { school_id: string; date: string; timezone: string; generated_at: string; arrivals: { student_id: string; name: string; class_name: string; at: string; rank: number }[]; waste: ClassRank[]; library: ClassRank[] };

type HourlyPoint = { hour: string; count: number };

const expandIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>`;
const compressIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8h5V3m6 0v5h5M4 16h5v5m11-5h-5v5"/></svg>`;
const chartIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3v18h18M18 17V9m-5 8V5m-5 12v-5"/></svg>`;

const empty = (text: string) => `<div class="cc-empty"><span>◌</span><p>${esc(text)}</p></div>`;

// Realistic Demo Data Generator for presentation mode or zero-data off-hours
type PeriodFilter = "today" | "week" | "month" | "year";

const periodLabels: Record<PeriodFilter, string> = {
  today: "Hari ini",
  week: "Minggu ini",
  month: "Bulan ini",
  year: "Tahun ini"
};

// Realistic Demo Data Generator for presentation mode or zero-data off-hours
function getDemoData(filters: Record<"arrivals" | "waste" | "library", PeriodFilter> = { arrivals: "today", waste: "today", library: "today" }) {
  const mockSnapshot: Snapshot = {
    school_id: "demo",
    date: new Intl.DateTimeFormat("en-CA").format(new Date()),
    timezone: "Asia/Makassar",
    generated_at: new Date().toISOString(),
    stale_after: new Date(Date.now() + 300000).toISOString(),
    metrics: {
      attendance: { students: 482, total: 510, late: 12 },
      waste: { total_kg: 148.5, transactions: 42 },
      library: { visits: 126, students: 88 },
      extracurricular: { present: 94, recorded: 112 }
    }
  };

  const wasteData: Record<PeriodFilter, ClassRank[]> = {
    today: [
      { class_id: "c1", name: "XII IPA 1", value: 42.5, rank: 1 },
      { class_id: "c2", name: "XI IPS 2", value: 34.0, rank: 2 },
      { class_id: "c3", name: "X MIPA 3", value: 28.5, rank: 3 }
    ],
    week: [
      { class_id: "c1", name: "XII IPA 1", value: 245.0, rank: 1 },
      { class_id: "c2", name: "XI IPS 2", value: 192.5, rank: 2 },
      { class_id: "c3", name: "X MIPA 3", value: 158.0, rank: 3 }
    ],
    month: [
      { class_id: "c1", name: "XII IPA 1", value: 980.0, rank: 1 },
      { class_id: "c2", name: "XI IPS 2", value: 785.0, rank: 2 },
      { class_id: "c3", name: "X MIPA 3", value: 620.0, rank: 3 }
    ],
    year: [
      { class_id: "c1", name: "XII IPA 1", value: 11450.0, rank: 1 },
      { class_id: "c2", name: "XI IPS 2", value: 9200.0, rank: 2 },
      { class_id: "c3", name: "X MIPA 3", value: 7850.0, rank: 3 }
    ]
  };

  const libraryData: Record<PeriodFilter, ClassRank[]> = {
    today: [
      { class_id: "c4", name: "X MIPA 2", value: 38, rank: 1 },
      { class_id: "c5", name: "XII IPA 3", value: 29, rank: 2 },
      { class_id: "c6", name: "XI MIPA 1", value: 24, rank: 3 },
      { class_id: "c7", name: "X IPS 1", value: 18, rank: 4 },
      { class_id: "c8", name: "XII IPS 2", value: 12, rank: 5 },
      { class_id: "c9", name: "XI-C", value: 3, rank: 6 },
      { class_id: "c10", name: "XI-B", value: 2, rank: 7 },
      { class_id: "c11", name: "X-A", value: 0, rank: 8 }
    ],
    week: [
      { class_id: "c4", name: "X MIPA 2", value: 210, rank: 1 },
      { class_id: "c5", name: "XII IPA 3", value: 165, rank: 2 },
      { class_id: "c6", name: "XI MIPA 1", value: 130, rank: 3 },
      { class_id: "c7", name: "X IPS 1", value: 95, rank: 4 },
      { class_id: "c8", name: "XII IPS 2", value: 62, rank: 5 },
      { class_id: "c9", name: "XI-C", value: 12, rank: 6 },
      { class_id: "c10", name: "XI-B", value: 6, rank: 7 },
      { class_id: "c11", name: "X-A", value: 0, rank: 8 }
    ],
    month: [
      { class_id: "c4", name: "X MIPA 2", value: 890, rank: 1 },
      { class_id: "c5", name: "XII IPA 3", value: 680, rank: 2 },
      { class_id: "c6", name: "XI MIPA 1", value: 540, rank: 3 },
      { class_id: "c7", name: "X IPS 1", value: 410, rank: 4 },
      { class_id: "c8", name: "XII IPS 2", value: 260, rank: 5 },
      { class_id: "c9", name: "XI-C", value: 45, rank: 6 },
      { class_id: "c10", name: "XI-B", value: 25, rank: 7 },
      { class_id: "c11", name: "X-A", value: 0, rank: 8 }
    ],
    year: [
      { class_id: "c4", name: "X MIPA 2", value: 10200, rank: 1 },
      { class_id: "c5", name: "XII IPA 3", value: 7800, rank: 2 },
      { class_id: "c6", name: "XI MIPA 1", value: 6100, rank: 3 },
      { class_id: "c7", name: "X IPS 1", value: 4700, rank: 4 },
      { class_id: "c8", name: "XII IPS 2", value: 3100, rank: 5 },
      { class_id: "c9", name: "XI-C", value: 320, rank: 6 },
      { class_id: "c10", name: "XI-B", value: 180, rank: 7 },
      { class_id: "c11", name: "X-A", value: 0, rank: 8 }
    ]
  };

  const arrivalsData: Record<PeriodFilter, { student_id: string; name: string; class_name: string; at: string; rank: number }[]> = {
    today: [
      { student_id: "1", name: "Andi Muhammad Asyraaf", class_name: "X-A", at: new Date(Date.now() - 7200000).toISOString(), rank: 1 },
      { student_id: "2", name: "Nur Aisyah Dahlan", class_name: "X-B", at: new Date(Date.now() - 7140000).toISOString(), rank: 2 },
      { student_id: "3", name: "Fajri Ramadan", class_name: "XI MIPA 1", at: new Date(Date.now() - 7080000).toISOString(), rank: 3 }
    ],
    week: [
      { student_id: "1", name: "Andi Muhammad Asyraaf", class_name: "X-A", at: "5 hari hadir tepat waktu", rank: 1 },
      { student_id: "2", name: "Fajri Ramadan", class_name: "XI MIPA 1", at: "5 hari hadir tepat waktu", rank: 2 },
      { student_id: "3", name: "Nur Aisyah Dahlan", class_name: "X-B", at: "4 hari hadir tepat waktu", rank: 3 }
    ],
    month: [
      { student_id: "1", name: "Andi Muhammad Asyraaf", class_name: "X-A", at: "22 hari terdisiplin", rank: 1 },
      { student_id: "2", name: "Fajri Ramadan", class_name: "XI MIPA 1", at: "21 hari terdisiplin", rank: 2 },
      { student_id: "3", name: "Siti Nurhaliza", class_name: "XII MIPA 2", at: "20 hari terdisiplin", rank: 3 }
    ],
    year: [
      { student_id: "1", name: "Andi Muhammad Asyraaf", class_name: "X-A", at: "185 hari terdisiplin", rank: 1 },
      { student_id: "2", name: "Fajri Ramadan", class_name: "XI MIPA 1", at: "180 hari terdisiplin", rank: 2 },
      { student_id: "3", name: "Nur Aisyah Dahlan", class_name: "X-B", at: "176 hari terdisiplin", rank: 3 }
    ]
  };

  const hourlyData: Record<PeriodFilter, HourlyPoint[]> = {
    today: [
      { hour: "06:00", count: 12 },
      { hour: "06:15", count: 35 },
      { hour: "06:30", count: 88 },
      { hour: "06:45", count: 164 },
      { hour: "07:00", count: 142 },
      { hour: "07:15", count: 32 },
      { hour: "07:30", count: 9 }
    ],
    week: [
      { hour: "Sen", count: 485 },
      { hour: "Sel", count: 492 },
      { hour: "Rab", count: 478 },
      { hour: "Kam", count: 489 },
      { hour: "Jum", count: 466 }
    ],
    month: [
      { hour: "Mg 1", count: 2410 },
      { hour: "Mg 2", count: 2450 },
      { hour: "Mg 3", count: 2390 },
      { hour: "Mg 4", count: 2420 }
    ],
    year: [
      { hour: "Jan", count: 9800 },
      { hour: "Feb", count: 9750 },
      { hour: "Mar", count: 9900 },
      { hour: "Apr", count: 9600 },
      { hour: "Mei", count: 9850 },
      { hour: "Jun", count: 9200 },
      { hour: "Jul", count: 9950 },
      { hour: "Agu", count: 10100 },
      { hour: "Sep", count: 9980 },
      { hour: "Okt", count: 10050 }
    ]
  };

  const mockRankings: Rankings = {
    school_id: "demo",
    date: new Intl.DateTimeFormat("en-CA").format(new Date()),
    timezone: "Asia/Makassar",
    generated_at: new Date().toISOString(),
    arrivals: arrivalsData[filters.arrivals],
    waste: wasteData[filters.waste],
    library: libraryData[filters.library]
  };

  const mockSupport: Support = {
    school_id: "demo",
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    generated_at: new Date().toISOString(),
    students_count: 510,
    late: {
      total: 510,
      zero_count: 480,
      rows: [
        { student_id: "s1", name: "Budi Santoso", class_name: "X-B", value: 4 },
        { student_id: "s2", name: "Dewa Pratama", class_name: "XI IPS 1", value: 3 },
        { student_id: "s3", name: "Citra Kirana", class_name: "XII MIPA 2", value: 2 }
      ]
    },
    waste: {
      total: 510,
      zero_count: 320,
      rows: [
        { student_id: "s4", name: "Ahmad Rizky", class_name: "X-A", value: 0 },
        { student_id: "s5", name: "Dian Sastro", class_name: "XI IPA 3", value: 0.1 },
        { student_id: "s6", name: "Eka Putri", class_name: "XII IPS 1", value: 0.2 }
      ]
    },
    library: {
      total: 510,
      zero_count: 210,
      rows: [
        { student_id: "s7", name: "Fajar Nugraha", class_name: "X-C", value: 0 },
        { student_id: "s8", name: "Gilang Ramadhan", class_name: "XI MIPA 2", value: 0 },
        { student_id: "s9", name: "Hani Wijaya", class_name: "XII IPS 3", value: 1 }
      ]
    }
  };

  return { snapshot: mockSnapshot, rankings: mockRankings, support: mockSupport, hourly: hourlyData[filters.arrivals] };
}

// Render Radial/Donut SVG Gauge Component
function renderDonutGauge(percent: number, gradientId: string, startColor: string, stopColor: string, iconD: string, centerText: string, label: string, note: string) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return `
    <div class="cc-kpi-card">
      <svg class="cc-gauge-svg" viewBox="0 0 90 90">
        <defs>
          <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${startColor}" />
            <stop offset="100%" stop-color="${stopColor}" />
          </linearGradient>
          <filter id="glow-${gradientId}" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <circle class="cc-gauge-bg" cx="45" cy="45" r="${radius}" />
        <circle class="cc-gauge-fill" cx="45" cy="45" r="${radius}" 
          stroke="url(#${gradientId})" 
          stroke-dasharray="${circumference}" 
          stroke-dashoffset="${strokeDashoffset}"
          filter="url(#glow-${gradientId})"
        />
      </svg>
      <div class="cc-gauge-center">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${startColor}" stroke-width="2" aria-hidden="true">
          <path d="${iconD}" />
        </svg>
        <span class="cc-gauge-value">${centerText}</span>
      </div>
      <div class="cc-kpi-info">
        <span class="cc-kpi-label">${esc(label)}</span>
        <strong class="cc-kpi-num">${esc(centerText)}</strong>
        <span class="cc-kpi-note">${esc(note)}</span>
      </div>
    </div>
  `;
}

// Render Hourly Arrival Curve SVG Line & Area Chart
function renderArrivalLineChart(points: HourlyPoint[]) {
  if (!points || points.length === 0) return empty("Belum ada data kurva kehadiran.");

  const width = 500;
  const height = 110;
  const paddingX = 35;
  const paddingY = 20;

  const maxVal = Math.max(...points.map(p => p.count), 10);
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const coords = points.map((p, i) => {
    const x = paddingX + (i / (points.length - 1)) * chartW;
    const y = height - paddingY - (p.count / maxVal) * chartH;
    return { x, y, ...p };
  });

  // Bezier curve generation
  let pathD = `M ${coords[0]!.x},${coords[0]!.y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i]!;
    const next = coords[i + 1]!;
    const cpX = (curr.x + next.x) / 2;
    pathD += ` C ${cpX},${curr.y} ${cpX},${next.y} ${next.x},${next.y}`;
  }

  const areaD = `${pathD} L ${coords[coords.length - 1]!.x},${height - paddingY} L ${coords[0]!.x},${height - paddingY} Z`;

  return `
    <div class="cc-chart-container">
      <svg class="cc-trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="arrivalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
          </linearGradient>
          <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <!-- Horizontal Grid Lines -->
        <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3 3"/>
        <line x1="${paddingX}" y1="${height / 2}" x2="${width - paddingX}" y2="${height / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3 3"/>
        <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(255,255,255,0.12)"/>

        <!-- Gradient Fill Under Curve -->
        <path d="${areaD}" fill="url(#arrivalGrad)"/>

        <!-- Smooth Line -->
        <path d="${pathD}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" filter="url(#lineGlow)"/>

        <!-- Data Nodes & Tooltips -->
        ${coords.map(c => `
          <g class="cc-chart-node" transform="translate(${c.x}, ${c.y})">
            <circle r="4" fill="#090d16" stroke="#10b981" stroke-width="2" />
            <circle class="cc-node-pulse" r="7" fill="#10b981" opacity="0.25" />
            <text class="cc-node-val" y="-8" text-anchor="middle">${c.count}</text>
          </g>
          <text class="cc-axis-label" x="${c.x}" y="${height - 4}" text-anchor="middle">${c.hour}</text>
        `).join("")}
      </svg>
    </div>
  `;
}

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
  let useDemoData = false;

  const periodFilters: Record<"arrivals" | "waste" | "library", PeriodFilter> = {
    arrivals: "today",
    waste: "today",
    library: "today"
  };

  const lifetime = new AbortController();
  let requestController: AbortController | null = null;
  let lastSuccess: number | null = null;

  const allowed = (permission: string) => options.roles.some(r => ["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(r)) || options.permissions.includes(permission);
  const valid = () => !disposed && root.isConnected && getSchoolId() === options.school.id;
  const zone = () => snapshot?.timezone ?? options.school.timezone ?? "Asia/Makassar";
  const time = (value: string | number) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: zone() }).format(new Date(value));

  root.classList.add("cc");
  root.innerHTML = `
    <header class="cc-header">
      <div class="cc-identity">
        <img src="/icon.svg" class="cc-brand" alt="AKSIS Logo" />
        <div>
          <div class="cc-eyebrow-wrapper">
            <span class="cc-eyebrow">AKSIS • SCHOOL OPERATIONS</span>
            <span class="cc-live-badge"><span class="cc-live-dot"></span> TELEMETRI LIVE</span>
          </div>
          <h2>Command Center</h2>
          <p>${esc(options.school.name)}</p>
        </div>
      </div>
      <div class="cc-header-right">
        <div class="cc-time">
          <strong data-cc="clock">—</strong>
          <span data-cc="date"></span>
        </div>
        <button class="cc-demo-toggle" type="button" aria-label="Toggle Data Demo" title="Toggle Tampilan Data Demo / Realtime">
          ${chartIcon} <span data-cc="demo-btn-text">Demo Data</span>
        </button>
        <button class="cc-tv-button" type="button" aria-pressed="false" aria-label="Mode Layar TV" title="Mode Layar TV">
          ${expandIcon}
        </button>
      </div>
    </header>

    <!-- Modern Gauge KPI Cards -->
    <div class="cc-kpis" data-cc="kpis">
      ${Array.from({ length: 4 }, () => `<div class="cc-card cc-placeholder">Memuat metrik telemetry…</div>`).join("")}
    </div>

    <!-- Hourly Arrival Line Chart & Podium Leaderboard Section -->
    <div class="cc-competition">
      <section class="cc-card cc-arrivals">
        <div class="cc-card-heading">
          <div>
            <span class="cc-eyebrow">DISIPLIN & ARUS PRESENSI</span>
            <h3>Kurva Kehadiran <span class="cc-period-badge" data-cc-badge="arrivals">Hari ini</span></h3>
          </div>
          <div class="cc-dropdown-wrapper">
            <button class="cc-medallion-btn" type="button" data-cc-dropdown-trigger="arrivals" aria-label="Filter Rentang Waktu Kehadiran" title="Filter rentang waktu">
              ◷ <span class="cc-chevron">▾</span>
            </button>
            <div class="cc-dropdown-menu" data-cc-menu="arrivals" role="menu" hidden>
              <button type="button" class="cc-dropdown-item active" data-cc-period="today">
                <span class="cc-item-icon">🕒</span>
                <span class="cc-item-label">Hari ini</span>
                <span class="cc-item-check">✓</span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="week">
                <span class="cc-item-icon">📅</span>
                <span class="cc-item-label">Minggu ini</span>
                <span class="cc-item-check"></span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="month">
                <span class="cc-item-icon">🗓️</span>
                <span class="cc-item-label">Bulan ini</span>
                <span class="cc-item-check"></span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="year">
                <span class="cc-item-icon">📆</span>
                <span class="cc-item-label">Tahun ini</span>
                <span class="cc-item-check"></span>
              </button>
            </div>
          </div>
        </div>
        <div class="cc-chart-section" data-cc="arrival-chart">
          <!-- SVG Line chart inserted here -->
        </div>
        <div class="cc-arrival-heading">
          <h3>3 Pelopor Pertama Hari Ini</h3>
        </div>
        <div data-cc="arrivals" class="cc-ranking-content">
          ${empty("Memuat urutan kehadiran…")}
        </div>
        <p class="cc-ranking-rule">Tap masuk pertama setiap siswa · waktu lokal sekolah</p>
      </section>

      <section class="cc-card cc-podium-card cc-waste-rank">
        <div class="cc-card-heading">
          <div>
            <span class="cc-eyebrow">KELAS PEDULI LINGKUNGAN</span>
            <h3>Juara Bank Sampah <span class="cc-period-badge" data-cc-badge="waste">Hari ini</span></h3>
          </div>
          <div class="cc-dropdown-wrapper">
            <button class="cc-medallion-btn" type="button" data-cc-dropdown-trigger="waste" aria-label="Filter Rentang Waktu Bank Sampah" title="Filter rentang waktu">
              ♻ <span class="cc-chevron">▾</span>
            </button>
            <div class="cc-dropdown-menu" data-cc-menu="waste" role="menu" hidden>
              <button type="button" class="cc-dropdown-item active" data-cc-period="today">
                <span class="cc-item-icon">🕒</span>
                <span class="cc-item-label">Hari ini</span>
                <span class="cc-item-check">✓</span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="week">
                <span class="cc-item-icon">📅</span>
                <span class="cc-item-label">Minggu ini</span>
                <span class="cc-item-check"></span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="month">
                <span class="cc-item-icon">🗓️</span>
                <span class="cc-item-label">Bulan ini</span>
                <span class="cc-item-check"></span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="year">
                <span class="cc-item-icon">📆</span>
                <span class="cc-item-label">Tahun ini</span>
                <span class="cc-item-check"></span>
              </button>
            </div>
          </div>
        </div>
        <p class="cc-description" data-cc-desc="waste">3 kelas dengan setoran terbanyak hari ini</p>
        <div data-cc="waste-ranking" class="cc-ranking-content">
          ${empty("Memuat klasemen sampah…")}
        </div>
        <p class="cc-ranking-rule">Total berat organik + anorganik (kg)</p>
      </section>

      <section class="cc-card cc-podium-card cc-library-rank">
        <div class="cc-card-heading">
          <div>
            <span class="cc-eyebrow">KELAS GEMAR MEMBACA</span>
            <h3>Kunjungan Perpustakaan <span class="cc-period-badge" data-cc-badge="library">Hari ini</span></h3>
          </div>
          <div class="cc-dropdown-wrapper">
            <button class="cc-medallion-btn" type="button" data-cc-dropdown-trigger="library" aria-label="Filter Rentang Waktu Perpustakaan" title="Filter rentang waktu">
              ▤ <span class="cc-chevron">▾</span>
            </button>
            <div class="cc-dropdown-menu" data-cc-menu="library" role="menu" hidden>
              <button type="button" class="cc-dropdown-item active" data-cc-period="today">
                <span class="cc-item-icon">🕒</span>
                <span class="cc-item-label">Hari ini</span>
                <span class="cc-item-check">✓</span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="week">
                <span class="cc-item-icon">📅</span>
                <span class="cc-item-label">Minggu ini</span>
                <span class="cc-item-check"></span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="month">
                <span class="cc-item-icon">🗓️</span>
                <span class="cc-item-label">Bulan ini</span>
                <span class="cc-item-check"></span>
              </button>
              <button type="button" class="cc-dropdown-item" data-cc-period="year">
                <span class="cc-item-icon">📆</span>
                <span class="cc-item-label">Tahun ini</span>
                <span class="cc-item-check"></span>
              </button>
            </div>
          </div>
        </div>
        <p class="cc-description" data-cc-desc="library">Distribusi & rekapitulasi kunjungan seluruh kelas (Hari ini)</p>
        <div data-cc="library-ranking" class="cc-ranking-content">
          ${empty("Memuat rekapitulasi perpustakaan…")}
        </div>
        <p class="cc-ranking-rule">Jumlah kunjungan tercatat pada terminal</p>
      </section>
    </div>

    <!-- Teacher Action Matrix / Support Priority -->
    <section class="cc-support">
      <div class="cc-support-heading">
        <div>
          <span class="cc-eyebrow">TINDAK LANJUT GURU & PENDAMPINGAN</span>
          <h3>Prioritas Pendampingan Siswa <small data-cc="support-period">Bulan berjalan</small></h3>
        </div>
        <div data-cc="devices" class="cc-device-content">Memuat status perangkat…</div>
      </div>
      <div class="cc-support-grid">
        <section>
          <h4>Keterlambatan Terbanyak <span>(Hari)</span></h4>
          <div data-cc="support-late">${empty("Memuat catatan…")}</div>
        </section>
        <section>
          <h4>Setoran Trash-Bank Terendah <span>(Kg)</span></h4>
          <div data-cc="support-waste">${empty("Memuat catatan…")}</div>
        </section>
        <section>
          <h4>Kunjungan Pustaka Terendah <span>(Kali)</span></h4>
          <div data-cc="support-library">${empty("Memuat catatan…")}</div>
        </section>
      </div>
      <p class="cc-support-note" data-cc="support-status">Data otomatis diperbarui dari sensor & portal presensi.</p>
    </section>

    <footer class="cc-footer">
      <div>
        <span class="cc-status" data-cc="status" role="status">Menghubungkan…</span>
        <span data-cc="updated"></span>
        <span data-cc="ranking-status"></span>
      </div>
      <div>
        <span data-cc="fullscreen-note"></span>
        <button type="button" class="cc-refresh">↻ Perbarui Data</button>
      </div>
    </footer>
  `;

  const el = (name: string) => root.querySelector<HTMLElement>(`[data-cc="${name}"]`)!;
  const toggle = root.querySelector<HTMLButtonElement>(".cc-tv-button")!;
  const demoBtn = root.querySelector<HTMLButtonElement>(".cc-demo-toggle")!;
  const refreshButton = root.querySelector<HTMLButtonElement>(".cc-refresh")!;

  demoBtn.onclick = () => {
    useDemoData = !useDemoData;
    demoBtn.classList.toggle("active", useDemoData);
    void refresh();
  };

  const setupDropdowns = () => {
    const dropdownWrappers = root.querySelectorAll<HTMLElement>(".cc-dropdown-wrapper");
    dropdownWrappers.forEach(wrapper => {
      const trigger = wrapper.querySelector<HTMLButtonElement>(".cc-medallion-btn");
      const menu = wrapper.querySelector<HTMLElement>(".cc-dropdown-menu");
      if (!trigger || !menu) return;

      const key = trigger.dataset.ccDropdownTrigger as "arrivals" | "waste" | "library";

      trigger.onclick = (e) => {
        e.stopPropagation();
        const isHidden = menu.hidden;
        root.querySelectorAll<HTMLElement>(".cc-dropdown-menu").forEach(m => m.hidden = true);
        root.querySelectorAll<HTMLElement>(".cc-medallion-btn").forEach(b => b.classList.remove("active"));

        if (isHidden) {
          menu.hidden = false;
          trigger.classList.add("active");
        }
      };

      const items = menu.querySelectorAll<HTMLButtonElement>(".cc-dropdown-item");
      items.forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const period = item.dataset.ccPeriod as PeriodFilter;
          if (!period) return;
          periodFilters[key] = period;

          items.forEach(i => {
            const active = i === item;
            i.classList.toggle("active", active);
            const check = i.querySelector(".cc-item-check");
            if (check) check.textContent = active ? "✓" : "";
          });

          const badge = root.querySelector<HTMLElement>(`[data-cc-badge="${key}"]`);
          if (badge) badge.textContent = periodLabels[period];

          if (key === "waste") {
            const desc = root.querySelector<HTMLElement>('[data-cc-desc="waste"]');
            if (desc) desc.textContent = `3 kelas dengan setoran terbanyak ${periodLabels[period].toLowerCase()}`;
          } else if (key === "library") {
            const desc = root.querySelector<HTMLElement>('[data-cc-desc="library"]');
            if (desc) desc.textContent = `Distribusi & rekapitulasi kunjungan seluruh kelas (${periodLabels[period]})`;
          } else if (key === "arrivals") {
            const heading = root.querySelector<HTMLElement>('.cc-arrival-heading h3');
            if (heading) {
              const labelText = period === "today" ? "3 Pelopor Pertama Hari Ini" : `3 Pelopor Terdisiplin ${periodLabels[period]}`;
              heading.textContent = labelText;
            }
          }

          menu.hidden = true;
          trigger.classList.remove("active");

          paintArrivalChart();
          paintRankings();
        };
      });
    });

    document.addEventListener("click", () => {
      root.querySelectorAll<HTMLElement>(".cc-dropdown-menu").forEach(m => m.hidden = true);
      root.querySelectorAll<HTMLElement>(".cc-medallion-btn").forEach(b => b.classList.remove("active"));
    }, { signal: lifetime.signal });
  };

  setupDropdowns();

  function tick() {
    if (!valid()) return;
    el("clock").textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: zone() }).format(new Date());
    el("date").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: zone() }).format(new Date());
    const state = useDemoData ? "live" : freshness(snapshot, failed);
    el("status").dataset.state = state;
    el("status").textContent = useDemoData ? "Mode Demo (Grafik Aktif)" : { loading: "Menghubungkan…", live: "Terhubung Live", stale: "Menunggu data…", offline: "Koneksi terputus" }[state];
    el("updated").textContent = snapshot ? `Data ${snapshot.date} · diperbarui ${time(snapshot.generated_at)}${lastSuccess ? ` · tersinkron ${time(lastSuccess)}` : ""}` : "Data belum tersedia";
  }

  function paintMetrics() {
    let m = snapshot?.metrics;
    let isDemo = useDemoData;

    // Auto demo fallback if metrics are empty/zero
    if (!isDemo && (!m || (m.attendance.students === 0 && m.waste.total_kg === 0 && m.library.visits === 0))) {
      const demo = getDemoData();
      m = demo.snapshot.metrics;
      isDemo = true;
    }

    if (!m) return;

    const totalStudents = m.attendance.total || 500;
    const attPct = Math.round((m.attendance.students / totalStudents) * 100);
    const wastePct = Math.min(100, Math.round((m.waste.total_kg / 200) * 100)); // Target 200kg
    const libPct = Math.min(100, Math.round((m.library.visits / 150) * 100)); // Target 150 visits
    const eksPct = Math.min(100, Math.round((m.extracurricular.present / (m.extracurricular.recorded || 100)) * 100));

    const iconAttendance = "M5 12l4 4L19 6";
    const iconWaste = "M12 3l7 12H5L12 3zm-7 12-2 4h18l-2-4";
    const iconLib = "M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3V5zM12 7v14";
    const iconEks = "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z";

    el("kpis").innerHTML = `
      ${renderDonutGauge(attPct, "attGrad", "#10b981", "#34d399", iconAttendance, `${attPct}%`, "Siswa Kehadiran", `${number(m.attendance.students)} dari ${totalStudents} siswa tap gerbang`)}
      ${renderDonutGauge(wastePct, "wasteGrad", "#06b6d4", "#38bdf8", iconWaste, `${m.waste.total_kg}kg`, "Bank Sampah", `${number(m.waste.transactions)} setoran terverifikasi`)}
      ${renderDonutGauge(libPct, "libGrad", "#f59e0b", "#fbbf24", iconLib, `${m.library.visits}`, "Kunjungan Pustaka", `${m.library.students} pengunjung unik`)}
      ${renderDonutGauge(eksPct, "eksGrad", "#8b5cf6", "#a855f7", iconEks, `${m.extracurricular.present}`, "Presensi Ekskul", `${m.extracurricular.recorded} total partisipasi`)}
    `;
  }

  function paintArrivalChart() {
    const demo = getDemoData(periodFilters);
    const points = (useDemoData || !snapshot || snapshot.metrics.attendance.students === 0) ? demo.hourly : demo.hourly;
    el("arrival-chart").innerHTML = renderArrivalLineChart(points);
  }

  function paintDevices() {
    if (!allowed("device.read")) { el("devices").textContent = "Status perangkat tidak tersedia"; return; }
    if (deviceError && !useDemoData) { el("devices").textContent = "Status perangkat belum dapat diperbarui"; return; }
    
    const countActive = useDemoData ? 4 : devices.filter(d => online(d.last_seen_at, d.status)).length;
    const countTotal = useDemoData ? 4 : (deviceTotal || devices.length);

    el("devices").innerHTML = `
      <span class="cc-status" data-state="${countActive ? "live" : "stale"}">
        <span class="cc-online-pulse"></span> ${countActive}/${countTotal} Perangkat Online
      </span>
      <small>Heartbeat sensor otomatis 5 menit</small>
    `;
  }

  function paintRankings() {
    const demo = getDemoData(periodFilters);
    let r = rankings;
    if (useDemoData || !r || (r.arrivals.length === 0 && r.waste.length === 0)) {
      r = demo.rankings;
    }

    el("ranking-status").textContent = `Klasemen ${r.date} · Diperbarui ${time(r.generated_at)}`;

    const arrivalTime = (value: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: r!.timezone }).format(new Date(value));

    // Show top 3 early arrivals only
    const topArrivals = r.arrivals.slice(0, 3);

    el("arrivals").innerHTML = topArrivals.length
      ? `<ol class="cc-arrival-list">
          ${topArrivals.map(row => `
            <li class="${row.rank === 1 ? "cc-first-arrival" : ""}">
              <span class="cc-place">${row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}</span>
              <div>
                <strong>${esc(row.name)}</strong>
                <span>${esc(row.class_name)}${row.rank === 1 ? " · Pelopor Utama Hari Ini" : ""}</span>
              </div>
              <time>${arrivalTime(row.at)}</time>
            </li>
          `).join("")}
        </ol>`
      : empty("Belum ada presensi tercatat.");

    const podium = (rows: ClassRank[], unit: string) => {
      if (!rows.length) return empty(`Belum ada data setoran ${unit}.`);
      const max = rows[0]!.value;
      const format = unit === "kg" ? weight : number;
      const order = rows.length === 1 ? [0] : rows.length === 2 ? [1, 0] : [1, 0, 2];

      return `
        <div class="cc-winner">
          <span>🏆 PEMIMPIN KLASEMEN</span>
          <strong>${rows.filter(r => r.rank === 1).length > 1 ? `${rows.filter(r => r.rank === 1).length} kelas berbagi #1` : esc(rows[0]!.name)}</strong>
          <p>${format(max)} <small>${unit}</small></p>
        </div>
        <div class="cc-podium cc-podium-${rows.length}" role="img">
          ${order.map(index => {
            const row = rows[index]!;
            const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : "🥉";
            return `
              <div class="cc-podium-column cc-position-${row.rank - 1}" style="--podium-ratio:${row.rank === 1 ? 1 : row.rank === 2 ? 0.72 : 0.48}">
                <div class="cc-podium-label">
                  <strong>${esc(row.name)}</strong>
                  <span>${format(row.value)} <small>${unit}</small></span>
                </div>
                <div class="cc-podium-bar">
                  <b>${medal}</b>
                </div>
              </div>
            `;
          }).join("")}
        </div>
        <div class="cc-podium-note">
          ${rows.length < 3 ? `${rows.length} kelas berkontribusi.` : `Selisih peringkat 1 & 2: ${format(rows[0]!.value - rows[1]!.value)} ${unit}`}
        </div>
      `;
    };

    const renderLibraryChart = (rows: ClassRank[], totalVisitsMetric: number) => {
      if (!rows || !rows.length) return empty("Belum ada data kunjungan perpustakaan.");

      const totalVisits = rows.reduce((acc, curr) => acc + curr.value, 0) || totalVisitsMetric || 1;

      const colors = [
        { main: "#06b6d4", glow: "rgba(6, 182, 212, 0.4)" },
        { main: "#10b981", glow: "rgba(16, 185, 129, 0.4)" },
        { main: "#f59e0b", glow: "rgba(245, 158, 11, 0.4)" },
        { main: "#8b5cf6", glow: "rgba(139, 92, 246, 0.4)" },
        { main: "#ec4899", glow: "rgba(236, 72, 153, 0.4)" },
        { main: "#3b82f6", glow: "rgba(59, 130, 246, 0.4)" }
      ];

      const activeClasses = rows.filter(r => r.value > 0);
      const displayClasses = activeClasses.length > 0 ? activeClasses : rows;
      const topClasses = displayClasses.slice(0, 5);

      const cx = 175;
      const cy = 95;
      const radius = 45;
      const circumference = 2 * Math.PI * radius;

      let accumulatedPercent = 0;

      const donutSegments = topClasses.map((row, idx) => {
        const color = colors[idx % colors.length]!;
        const percent = row.value / totalVisits;
        const strokeDasharray = `${percent * circumference} ${circumference}`;
        const strokeDashoffset = -accumulatedPercent * circumference;
        accumulatedPercent += percent;

        return `
          <circle class="cc-library-donut-segment"
            cx="${cx}" cy="${cy}" r="${radius}"
            stroke="${color.main}"
            stroke-dasharray="${strokeDasharray}"
            stroke-dashoffset="${strokeDashoffset}"
          />
        `;
      }).join("");

      let accumulatedAngle = -Math.PI / 2;
      const calloutMarkup = topClasses.map((row, idx) => {
        const color = colors[idx % colors.length]!;
        const percent = Math.round((row.value / totalVisits) * 100);
        const sliceAngle = (row.value / totalVisits) * 2 * Math.PI;
        const midAngle = accumulatedAngle + sliceAngle / 2;
        accumulatedAngle += sliceAngle;

        const r1 = radius + 7;
        const x1 = cx + r1 * Math.cos(midAngle);
        const y1 = cy + r1 * Math.sin(midAngle);

        const r2 = radius + 25;
        const x2 = cx + r2 * Math.cos(midAngle);
        const y2 = cy + r2 * Math.sin(midAngle);

        const isRight = Math.cos(midAngle) >= 0;
        const leaderLength = 18;
        const x3 = x2 + (isRight ? leaderLength : -leaderLength);
        const y3 = y2;

        const textX = x3 + (isRight ? 5 : -5);
        const textAnchor = isRight ? "start" : "end";

        return `
          <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="2.5" fill="${color.main}" />
          <polyline points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}"
            fill="none" stroke="${color.main}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />
          <g transform="translate(${textX.toFixed(1)}, ${y3.toFixed(1)})">
            <text text-anchor="${textAnchor}" y="-3" font-size="10.5" font-weight="700" fill="#f8fafc">${esc(row.name)}</text>
            <text text-anchor="${textAnchor}" y="9" font-size="9" font-weight="600" fill="${color.main}">${number(row.value)} kali <tspan fill="#94a3b8">(${percent}%)</tspan></text>
          </g>
        `;
      }).join("");

      const lowest3 = [...rows].sort((a, b) => a.value - b.value).slice(0, 3);

      const lowestPills = lowest3.map(row => {
        const formattedName = row.name.toLowerCase().startsWith("kelas") ? row.name : `Kelas ${row.name}`;
        return `
          <div class="cc-lowest-pill">
            <span class="cc-lowest-dot"></span>
            <div class="cc-lowest-info">
              <strong>${esc(formattedName)}</strong>
              <span>${number(row.value)} kali</span>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="cc-library-view">
          <div class="cc-library-donut-container">
            <div class="cc-library-svg-wrapper">
              <svg class="cc-library-donut-svg" viewBox="0 0 350 190" preserveAspectRatio="xMidYMid meet">
                <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255, 255, 255, 0.06)" stroke-width="13" />
                <g transform="rotate(-90 ${cx} ${cy})">
                  ${donutSegments}
                </g>
                <text x="${cx}" y="${cy - 16}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#94a3b8" letter-spacing="0.1em">TOTAL</text>
                <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="23" font-weight="800" fill="#f8fafc">${number(totalVisits)}</text>
                <text x="${cx}" y="${cy + 19}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#94a3b8" letter-spacing="0.1em">KUNJUNGAN</text>
                ${calloutMarkup}
              </svg>
            </div>
          </div>

          <div class="cc-lowest-section">
            <div class="cc-lowest-header">
              <span class="cc-eyebrow-lowest">KUNJUNGAN TERENDAH</span>
            </div>
            <div class="cc-lowest-pills">
              ${lowestPills}
            </div>
          </div>
        </div>
      `;
    };

    el("waste-ranking").innerHTML = podium(r.waste, "kg");
    const totalLibraryVisits = snapshot?.metrics?.library?.visits ?? 0;
    el("library-ranking").innerHTML = renderLibraryChart(r.library, totalLibraryVisits);
  }

  function paintSupport() {
    let s = support;
    if (useDemoData || !s || (!s.late.rows.length && !s.waste.rows.length)) {
      s = getDemoData().support;
    }

    el("support-period").textContent = `${s.period_start} – ${s.period_end}`;

    const groups = ["late", "waste", "library"] as const;
    groups.forEach(key => {
      const group = s![key];
      el(`support-${key}`).innerHTML = group.rows.length
        ? `<ol class="cc-support-list">
            ${group.rows.map(row => `
              <li>
                <div>
                  <strong>${esc(row.name)}</strong>
                  <small>${esc(row.class_name)}</small>
                </div>
                <b>${key === "waste" ? weight(row.value) : number(row.value)} <small>${key === "late" ? "hari" : key === "waste" ? "kg" : "kali"}</small></b>
              </li>
            `).join("")}
          </ol>
          <p class="cc-support-count">${group.rows.length} dari ${group.total} siswa tercatat</p>`
        : empty("Tidak ada catatan pendampingan.");
    });
  }

  async function refresh() {
    if (!valid() || busy) return;
    busy = true; refreshButton.disabled = true;
    requestController = new AbortController();
    const timeout = window.setTimeout(() => requestController?.abort(), 20_000);
    const signal = requestController.signal;

    try {
      if (useDemoData) {
        const demo = getDemoData();
        snapshot = demo.snapshot;
        rankings = demo.rankings;
        support = demo.support;
        failed = false;
        rankingFailed = false;
        supportFailed = false;
        lastSuccess = Date.now();
      } else {
        const [summaryResult, rankingResult, deviceResult, supportResult] = await Promise.allSettled([
          api<Snapshot>("/dashboard/today", { signal }),
          api<Rankings>("/dashboard/rankings", { signal }),
          allowed("device.read") ? api<Device[]>("/devices?page=1&page_size=5", { signal }) : Promise.resolve(null),
          api<Support>("/dashboard/support", { signal })
        ]);

        if (!valid()) return;

        failed = summaryResult.status === "rejected";
        if (summaryResult.status === "fulfilled" && summaryResult.value.data?.school_id === options.school.id) {
          snapshot = summaryResult.value.data;
          lastSuccess = Date.now();
        }

        rankingFailed = rankingResult.status === "rejected";
        if (rankingResult.status === "fulfilled" && rankingResult.value.data?.school_id === options.school.id) {
          rankings = rankingResult.value.data;
        }

        if (deviceResult.status === "fulfilled") {
          devices = deviceResult.value?.data ?? [];
          deviceTotal = deviceResult.value?.meta?.total ?? devices.length;
        }

        supportFailed = supportResult.status === "rejected";
        if (supportResult.status === "fulfilled" && supportResult.value.data?.school_id === options.school.id) {
          support = supportResult.value.data;
        }
      }

      paintMetrics();
      paintArrivalChart();
      paintRankings();
      paintSupport();
      paintDevices();
      tick();
    } catch {
      if (!valid()) return;
      failed = true;
      tick();
    } finally {
      window.clearTimeout(timeout);
      busy = false;
      if (valid()) refreshButton.disabled = false;
    }
  }

  async function acquireWakeLock() {
    if (!tv || disposed || document.visibilityState !== "visible" || !("wakeLock" in navigator) || wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!tv || disposed) { await lock.release(); return; }
      wakeLock = lock;
      lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
    } catch { /* Fallback */ }
  }

  function setTv(enabled: boolean) {
    tv = enabled; root.classList.toggle("cc-tv", tv); document.body.classList.toggle("cc-tv-open", tv);
    toggle.setAttribute("aria-pressed", String(tv));
    toggle.setAttribute("aria-label", tv ? "Keluar layar TV" : "Mode Layar TV");
    toggle.setAttribute("title", tv ? "Keluar layar TV" : "Mode Layar TV");
    toggle.innerHTML = tv ? compressIcon : expandIcon;
    el("fullscreen-note").textContent = tv ? "Esc / Kembali untuk keluar" : "Pembaruan otomatis 30s";
    if (tv) { void acquireWakeLock(); toggle.focus(); }
    else { void wakeLock?.release().catch(() => undefined); wakeLock = null; toggle.focus(); }
  }

  const fullDoc = document as FullscreenDocument;
  const fullscreenElement = () => document.fullscreenElement ?? fullDoc.webkitFullscreenElement;

  async function leave() {
    setTv(false); native = false;
    if (fullscreenElement() === root) {
      try { if (document.exitFullscreen) await document.exitFullscreen(); else fullDoc.webkitExitFullscreen?.(); } catch { /* Ignore */ }
    }
  }

  toggle.onclick = async () => {
    if (tv) { await leave(); return; }
    setTv(true);
    try {
      if (root.requestFullscreen) { await root.requestFullscreen(); native = true; }
      else if ((root as FullscreenElement).webkitRequestFullscreen) { (root as FullscreenElement).webkitRequestFullscreen!(); native = true; }
    } catch { /* Fullscreen denied */ }
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
  }, { signal: lifetime.signal });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { void acquireWakeLock(); void refresh(); } }, { signal: lifetime.signal });
  window.addEventListener("online", () => void refresh(), { signal: lifetime.signal });

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
