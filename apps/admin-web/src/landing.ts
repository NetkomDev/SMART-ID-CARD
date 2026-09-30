import { getSession } from "./lib/session";

const showcaseData: Record<string, { title: string, subtitle: string, icon: string, features: string[], badge: string, cta: string }> = {
  idcard: {
    title: "Smart ID Card Pelajar & Produksi Batch",
    subtitle: "Integrasi seamless dengan data Dapodik sekolah dan fitur pasfoto 3:4 yang diunggah mandiri oleh orang tua.",
    icon: "💳",
    badge: "PRODUKSI MASSAL INTEGRATED DAPODIK",
    features: [
      "Import data siswa otomatis dari file CSV/Excel Dapodik dengan deteksi pemisah kolom cerdas.",
      "Orang tua mengunggah foto pas 3:4 dari PWA dengan pemotong foto (cropper) aspek rasio tepat.",
      "Filter status foto 'Siap Cetak' di Super Admin untuk pembentukan batch antrean produksi.",
      "Cetak kartu pintar fisik dilengkapi QR Code unik dan nomor seri yang terenkripsi aman."
    ],
    cta: "Kelola Kartu Pelajar"
  },
  presensi: {
    title: "Presensi Gerbang IoT & LED Board Display",
    subtitle: "Pencatatan kehadiran masuk & pulang siswa secara tepat waktu melalui terminal tap RFID/QR gerbang.",
    icon: "🚪",
    badge: "IOT GATE ATTENDANCE & DISPLAY",
    features: [
      "Pencatatan waktu hadir & pulang kurang dari 1 detik per siswa.",
      "Terhubung langsung dengan display LED Board gerbang sekolah untuk sapaan siswa dan pengumuman.",
      "Notifikasi instan ke Portal PWA Orang Tua saat anak tiba di sekolah atau waktu pulang.",
      "Deteksi keterlambatan otomatis sesuai jam masuk operasional sekolah."
    ],
    cta: "Lihat Terminal Gerbang"
  },
  sampah: {
    title: "Piket Bank Sampah Edukatif Sekolah",
    subtitle: "Membangun karakter dan kepedulian lingkungan hidup siswa melalui penimbangan sampah terpilah.",
    icon: "♻",
    badge: "ECOLOGICAL WASTE BANK TERMINAL",
    features: [
      "Pencatatan setoran sampah anorganik (botol, plastik) dan organik (daun, kompos) per siswa.",
      "Terminal piket khusus tanpa password bagi siswa piket / petugas bank sampah.",
      "Akumulasi total kilogram sampah per siswa dan per kelas sebagai indikator kelas ramah lingkungan.",
      "Laporan statistik dampak ekologis bulanan untuk penilaian akreditasi sekolah."
    ],
    cta: "Portal Bank Sampah"
  },
  perpus: {
    title: "Terminal Kunjungan Perpustakaan Digital",
    subtitle: "Registrasi kedatangan siswa ke perpustakaan sekolah tanpa antrean dan tanpa formulir kertas.",
    icon: "▤",
    badge: "LIBRARY VISIT SCANNER",
    features: [
      "Siswa cukup menempelkan Smart ID Card ke scanner perpustakaan saat masuk.",
      "Terminal responsif yang otomatis menampilkan sapaan nama siswa dan kelasnya.",
      "Rekapitulasi statistik kunjungan perpustakaan harian, mingguan, dan bulanan per kelas.",
      "Mendukung integrasi data dengan Laporan Rekapitulasi Wali Kelas."
    ],
    cta: "Buka Terminal Perpus"
  },
  ekskul: {
    title: "Presensi Ekskul & Rekapitulasi eRapor",
    subtitle: "Manajemen kegiatan ekstrakurikuler lengkap dengan kalkulasi predikat keaktifan otomatis.",
    icon: "⭐",
    badge: "EXTRACURRICULAR & RAPOR RECAP",
    features: [
      "Pencatatan presensi sesi kegiatan ekskul (Pramuka, Paskibra, PMR, Olahraga, KTI, dll).",
      "Kalkulasi otomatis persentase kehadiran per ekskul (misal: Pramuka 100%, Silat 85%).",
      "Pemberian predikat keaktifan otomatis (Sangat Baik ≥90%, Baik 75-89%, Cukup 60-74%, Kurang <60%).",
      "Export CSV khusus eRapor dan cetakan Laporan Wali Kelas resmi lengkap dengan kolom tanda tangan."
    ],
    cta: "Buka Laporan Wali Kelas"
  },
  pwa: {
    title: "Portal PWA Tanpa Password untuk Orang Tua",
    subtitle: "Akses informasi siswa secara aman dan instan langsung dari layar utama smartphone.",
    icon: "📱",
    badge: "ZERO-PASSWORD PWA PORTALS",
    features: [
      "Cukup pindai QR sekolah satu kali lalu simpan ke HomeScreen (Add to Home Screen).",
      "Orang tua masuk dengan memasukkan NISN & Tanggal Lahir anak tanpa pusing mengingat password.",
      "Fitur upload foto siswa 3:4 mandiri untuk proses pencetakan Smart ID Card sekolah.",
      "Pantau presensi gerbang, setoran sampah, kunjungan perpus, dan kegiatan ekskul anak secara transparan."
    ],
    cta: "Jelajahi Portal PWA"
  }
};

export function renderLandingPage(navigate: (path: string) => void): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  const isLoggedIn = Boolean(getSession());

  app.innerHTML = `
    <div class="landing-page" id="main-content">
      <!-- Top Navigation Bar -->
      <header class="landing-header">
        <div class="landing-header-inner">
          <a href="/" class="landing-brand" id="landing-brand-link">
            <img src="/logo.png" alt="AKSIS.CO.ID Logo" class="landing-logo-img" />
            <div class="landing-brand-text">
              <span class="brand-title">AKSIS.CO.ID</span>
              <span class="brand-sub">Smart School Ecosystem</span>
            </div>
          </a>

          <nav class="landing-nav">
            <a href="#fitur" class="landing-nav-link">Fitur Utama</a>
            <a href="#modul" class="landing-nav-link">Modul Operasional</a>
            <a href="#kartu" class="landing-nav-link">Smart ID Card</a>
            <a href="#simulasi" class="landing-nav-link">Kalkulator</a>
          </nav>

          <div class="landing-actions">
            <button class="theme-toggle" id="landing-theme-toggle" title="Ubah Tema" aria-label="Ubah Tema">
              ${document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙"}
            </button>

            ${isLoggedIn 
              ? `<button class="button primary" id="btn-go-dashboard">Ke Dashboard <span>→</span></button>`
              : `<button class="button secondary" id="btn-portal-pwa">Portal PWA</button>
                 <button class="button primary" id="btn-login-admin">🔑 Masuk Admin <span>→</span></button>`
            }
          </div>
        </div>
      </header>

      <!-- Hero Section -->
      <section class="landing-hero">
        <div class="landing-hero-bg">
          <div class="glow-orb orb-1"></div>
          <div class="glow-orb orb-2"></div>
        </div>

        <div class="landing-hero-content">
          <div class="hero-badge">
            <span class="badge-dot"></span>
            <span>DOMAIN RESMI: WWW.AKSIS.CO.ID &bull; PLATFORM SEKOLAH CERDAS INTEGRATED IOT</span>
          </div>

          <h1 class="hero-title">
            Satu Kartu Pelajar Pintar untuk <span class="gradient-text">Seluruh Ekosistem Sekolah</span>
          </h1>

          <p class="hero-subtitle">
            AKSIS.CO.ID menghubungkan sistem presensi gerbang IoT real-time, pencetakan ID Card otomatis Dapodik, terminal bank sampah edukatif, presensi perpustakaan, hingga portal PWA orang tua dalam satu platform terpadu.
          </p>

          <div class="hero-cta-group">
            ${isLoggedIn
              ? `<button class="button primary hero-btn" id="hero-btn-dashboard">⚡ Masuk ke Dashboard Admin <span>→</span></button>`
              : `<button class="button primary hero-btn" id="hero-btn-login">🔑 Masuk Portal Admin <span>→</span></button>
                 <button class="button secondary hero-btn" id="hero-btn-pwa">📱 Akses Portal PWA Orang Tua</button>`
            }
          </div>

          <!-- Hero Metrics Bar -->
          <div class="hero-metrics">
            <div class="metric-card">
              <span class="metric-value">&lt; 1 Detik</span>
              <span class="metric-label">Kecepatan Tap Presensi IoT</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-card">
              <span class="metric-value">100% Sync</span>
              <span class="metric-label">Format Data Excel Dapodik</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-card">
              <span class="metric-value">6 Modul</span>
              <span class="metric-label">Integrasi Aktivitas Sekolah</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-card">
              <span class="metric-value">0 Password</span>
              <span class="metric-label">Portal PWA Instan QR</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Feature Grid Section -->
      <section class="landing-section" id="fitur">
        <div class="section-head">
          <span class="eyebrow">KEUNGGULAN UTAMA PLATFORM</span>
          <h2>Ekosistem Digital Sekolah Tanpa Hambatan</h2>
          <p>Dirancang khusus untuk memenuhi standar operasional sekolah modern Indonesia.</p>
        </div>

        <div class="feature-grid">
          <article class="feature-card">
            <div class="feature-icon sage">💳</div>
            <h3>Smart ID Card & Produksi Batch</h3>
            <p>Integrasi format Dapodik dengan foto 3:4 yang diunggah langsung oleh orang tua via PWA. Pencetakan kartu batch efisien dengan kode QR & serial unik.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon lime">🚪</div>
            <h3>Presensi Gerbang IoT & LED Board</h3>
            <p>Pencatatan waktu hadir & pulang secara instan melalui terminal tap RFID/QR. Terhubung langsung dengan pengumuman di LED Board gerbang sekolah.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon blue">♻</div>
            <h3>Bank Sampah Edukatif & Lingkungan</h3>
            <p>Mendorong karakter peduli lingkungan siswa. Petugas piket mencatat setoran sampah anorganik & organik per kelas secara akurat.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon sand">▤</div>
            <h3>Terminal Perpustakaan Digital</h3>
            <p>Pencatatan kunjungan perpus cepat tanpa antrean. Cukup pindai kartu siswa saat memasuki area perpustakaan sekolah.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon sage">⭐</div>
            <h3>Presensi Ekskul & Rekap Wali Kelas</h3>
            <p>Pencatatan sesi ekstrakurikuler otomatis dengan penilaian predikat keaktifan (Sangat Baik / Baik / Cukup) yang siap dimasukkan ke eRapor.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon lime">📱</div>
            <h3>Portal PWA Orang Tua Tanpa Password</h3>
            <p>Orang tua dan petugas cukup memindai QR sekolah satu kali lalu menyimpan aplikasi ke layar utama smartphone tanpa ribet pusing lupa password.</p>
          </article>
        </div>
      </section>

      <!-- Interactive Module Showcase -->
      <section class="landing-section showcase-section" id="modul">
        <div class="section-head">
          <span class="eyebrow">MODUL OPERASIONAL AKSIS</span>
          <h2>Jelajahi Cara Kerja Setiap Modul</h2>
          <p>Pilih modul di bawah untuk melihat rincian alur kerja operasionalnya.</p>
        </div>

        <div class="showcase-tabs">
          <button class="showcase-tab active" data-tab="idcard">💳 Smart ID Card</button>
          <button class="showcase-tab" data-tab="presensi">🚪 Presensi IoT & LED</button>
          <button class="showcase-tab" data-tab="sampah">♻ Bank Sampah</button>
          <button class="showcase-tab" data-tab="perpus">▤ Perpustakaan</button>
          <button class="showcase-tab" data-tab="ekskul">⭐ Ekskul & eRapor</button>
          <button class="showcase-tab" data-tab="pwa">📱 PWA Orang Tua</button>
        </div>

        <div class="showcase-content-box" id="showcase-display">
          <!-- Dynamic Content Rendered By JS -->
        </div>
      </section>

      <!-- Produksi Workflow Section -->
      <section class="landing-section" id="kartu">
        <div class="section-head">
          <span class="eyebrow">ALUR WORKFLOW SIMPEL</span>
          <h2>4 Langkah Mudah Produksi ID Card Pelajar</h2>
          <p>Tanpa perlu input manual satu per satu. Semuanya otomatis dan terstruktur.</p>
        </div>

        <div class="workflow-steps">
          <div class="workflow-step">
            <div class="step-num">01</div>
            <h4>Unggah Dapodik</h4>
            <p>Admin Sekolah mengunduh template CSV Excel AKSIS lalu copy-paste data Dapodik dan mengunggahnya ke dashboard.</p>
          </div>

          <div class="workflow-arrow">→</div>

          <div class="workflow-step">
            <div class="step-num">02</div>
            <h4>Upload Foto Ortu</h4>
            <p>Orang tua login ke PWA menggunakan NISN & Tgl Lahir anak, lalu mengunggah foto pas 3:4 dengan pemotong foto otomatis.</p>
          </div>

          <div class="workflow-arrow">→</div>

          <div class="workflow-step">
            <div class="step-num">03</div>
            <h4>Cetak Batch Admin</h4>
            <p>Super Admin memfilter siswa dengan status foto siap cetak, membuat batch antrean, lalu mencetak kartu fisik dengan QR.</p>
          </div>

          <div class="workflow-arrow">→</div>

          <div class="workflow-step">
            <div class="step-num">04</div>
            <h4>Aktif Digunakan</h4>
            <p>Kartu fisik diserahkan ke siswa dan langsung dapat digunakan di seluruh terminal RFID/QR gerbang, perpus, & sampah.</p>
          </div>
        </div>
      </section>

      <!-- Interactive Calculator Section -->
      <section class="landing-section calculator-section" id="simulasi">
        <div class="calculator-card">
          <div class="calculator-info">
            <span class="eyebrow">SIMULATOR EFISIENSI SEKOLAH</span>
            <h2>Kalkulator Efisiensi AKSIS.CO.ID</h2>
            <p>Geser jumlah siswa sekolah Anda untuk melihat proyeksi efisiensi operasional bulanan.</p>

            <div class="slider-group">
              <label for="student-slider">Jumlah Siswa Sekolah: <strong id="slider-val">750</strong> Siswa</label>
              <input type="range" id="student-slider" min="100" max="3000" step="50" value="750" />
            </div>
          </div>

          <div class="calculator-results">
            <div class="calc-res-item">
              <span>Waktu Presensi Gerbang Harian</span>
              <strong id="res-time">&lt; 15 Menit Total</strong>
              <small>Menghemat ~2 jam antrean manual setiap pagi</small>
            </div>
            <div class="calc-res-item">
              <span>Proyeksi Setoran Sampah Terolah</span>
              <strong id="res-waste">~ 225 Kg / Bulan</strong>
              <small>Edukasi lingkungan bagi seluruh siswa sekolah</small>
            </div>
            <div class="calc-res-item">
              <span>Efisiensi Rekap Laporan Wali Kelas</span>
              <strong id="res-reports">100% Otomatis</strong>
              <small>Presensi & Predikat Ekskul siap cetak/export CSV</small>
            </div>
          </div>
        </div>
      </section>

      <!-- Footer CTA -->
      <footer class="landing-footer">
        <div class="footer-top">
          <div class="footer-brand">
            <img src="/logo.png" alt="AKSIS.CO.ID" class="footer-logo" />
            <h3>AKSIS.CO.ID</h3>
            <p>Ekosistem Digital Sekolah Cerdas & Integrated Smart ID Card Pelajar Indonesia.</p>
          </div>

          <div class="footer-links">
            <div class="link-group">
              <h4>Navigasi Akses</h4>
              <a href="#fitur">Fitur Utama</a>
              <a href="#modul">Modul Sekolah</a>
              <a href="#simulasi">Kalkulator Sim</a>
            </div>

            <div class="link-group">
              <h4>Portal Utama</h4>
              <a href="/login" id="footer-login">Portal Admin Sekolah</a>
              <a href="/pwa-portals" id="footer-pwa">Portal PWA Orang Tua</a>
            </div>

            <div class="link-group">
              <h4>Domain Resmi</h4>
              <p class="domain-badge">🌐 www.aksis.co.id</p>
              <small>Hak Cipta &copy; 2026 AKSIS Platform. Seluruh Hak Dilindungi Undang-Undang.</small>
            </div>
          </div>
        </div>

        <div class="footer-bottom">
          <p>AKSIS.CO.ID &mdash; Solusi Presensi IoT, Smart ID Card, dan Ekosistem Sekolah Terpadu.</p>
        </div>
      </footer>
    </div>
  `;

  // Attach interactive events
  mountLandingEvents(navigate);
}

function renderShowcase(tabKey: string, navigate: (path: string) => void): void {
  const container = document.getElementById("showcase-display");
  if (!container) return;

  const data = showcaseData[tabKey] || showcaseData["idcard"]!;

  container.innerHTML = `
    <div class="showcase-card">
      <div class="showcase-text">
        <span class="eyebrow">${data.badge}</span>
        <h3>${data.icon} ${data.title}</h3>
        <p>${data.subtitle}</p>

        <ul class="showcase-list">
          ${data.features.map(f => `<li><span class="check-icon">✓</span> ${f}</li>`).join("")}
        </ul>

        <div class="showcase-cta">
          <button class="button primary" id="showcase-action-btn">${data.cta} <span>→</span></button>
        </div>
      </div>

      <div class="showcase-visual">
        <div class="visual-glass-card">
          <div class="visual-header">
            <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
            <span class="visual-title">AKSIS.CO.ID &bull; ${data.title}</span>
          </div>
          <div class="visual-body">
            <div class="visual-mock-badge">${data.icon}</div>
            <h4>${data.title}</h4>
            <p>Terintegrasi secara otomatis dengan database sekolah & portal PWA.</p>
            <div class="visual-stat-row">
              <div><span>Status</span><strong>ONLINE &bull; READY</strong></div>
              <div><span>Akurasi</span><strong>100% Sync</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("showcase-action-btn")?.addEventListener("click", () => {
    if (getSession()) {
      navigate("/");
    } else {
      navigate("/login");
    }
  });
}

function mountLandingEvents(navigate: (path: string) => void): void {
  // Theme toggle
  document.getElementById("landing-theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("aksis-theme", next);
    const btn = document.getElementById("landing-theme-toggle");
    if (btn) btn.textContent = next === "dark" ? "☀️" : "🌙";
  });

  // Navigation handlers
  const handleLogin = (e: Event) => { e.preventDefault(); navigate("/login"); };
  const handlePwa = (e: Event) => { e.preventDefault(); navigate("/pwa-portals"); };
  const handleDashboard = (e: Event) => { e.preventDefault(); navigate("/"); };

  document.getElementById("btn-login-admin")?.addEventListener("click", handleLogin);
  document.getElementById("hero-btn-login")?.addEventListener("click", handleLogin);
  document.getElementById("footer-login")?.addEventListener("click", handleLogin);

  document.getElementById("btn-portal-pwa")?.addEventListener("click", handlePwa);
  document.getElementById("hero-btn-pwa")?.addEventListener("click", handlePwa);
  document.getElementById("footer-pwa")?.addEventListener("click", handlePwa);

  document.getElementById("btn-go-dashboard")?.addEventListener("click", handleDashboard);
  document.getElementById("hero-btn-dashboard")?.addEventListener("click", handleDashboard);
  document.getElementById("landing-brand-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (getSession()) navigate("/");
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Tab showcase
  renderShowcase("idcard", navigate);

  document.querySelectorAll<HTMLButtonElement>(".showcase-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".showcase-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const key = tab.getAttribute("data-tab") || "idcard";
      renderShowcase(key, navigate);
    });
  });

  // Student Calculator Slider
  const slider = document.getElementById("student-slider") as HTMLInputElement | null;
  if (slider) {
    slider.addEventListener("input", () => {
      const num = parseInt(slider.value, 10);
      document.getElementById("slider-val")!.textContent = num.toLocaleString("id-ID");
      
      const timeMinutes = Math.ceil(num * 0.8 / 60);
      document.getElementById("res-time")!.textContent = `< ${timeMinutes} Menit Total`;
      
      const wasteKg = Math.round(num * 0.3);
      document.getElementById("res-waste")!.textContent = `~ ${wasteKg.toLocaleString("id-ID")} Kg / Bulan`;
    });
  }

  // Smooth scroll for nav links
  document.querySelectorAll<HTMLAnchorElement>('.landing-nav-link, .link-group a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (targetId && targetId.startsWith("#")) {
        e.preventDefault();
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth" });
        }
      }
    });
  });
}
