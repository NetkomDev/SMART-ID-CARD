import { getSession } from "./lib/session";

const showcaseData: Record<string, { title: string, subtitle: string, icon: string, features: string[], badge: string }> = {
  idcard: {
    title: "Smart ID Card Pelajar Serbaguna",
    subtitle: "Kartu identitas resmi siswa yang serbaguna, elegan, dan terintegrasi dengan seluruh fasilitas sekolah.",
    icon: "💳",
    badge: "KARTU PINTAR TERINTEGRASI",
    features: [
      "Satu kartu untuk presensi gerbang, perpustakaan, bank sampah, hingga kegiatan ekstrakurikuler.",
      "Desain kartu pintar berkualitas tinggi yang tahan lama dan berstandar nasional.",
      "Sinkronisasi otomatis dengan data Dapodik sekolah untuk akurasi identitas siswa.",
      "Memudahkan manajemen sekolah dalam mengelola data induk siswa secara terpusat."
    ]
  },
  presensi: {
    title: "Presensi Gerbang IoT Real-time & Display LED",
    subtitle: "Sistem pencatatan kehadiran gerbang otomatis yang cepat, akurat, dan transparan.",
    icon: "🚪",
    badge: "IOT GATE SYSTEM & LED DISPLAY",
    features: [
      "Kecepatan pemindaian presensi di bawah 1 detik tanpa memicu antrean di gerbang sekolah.",
      "Terhubung langsung dengan tampilan papan LED Board gerbang untuk pesan menyambut siswa.",
      "Pencatatan waktu hadir & pulang secara akurat untuk memupuk kedisiplinan siswa.",
      "Menghemat waktu piket guru dan memberikan laporan presensi yang transparan."
    ]
  },
  sampah: {
    title: "Bank Sampah Edukatif Sekolah",
    subtitle: "Program sekolah hijau yang membangun karakter kepedulian lingkungan hidup siswa secara nyata.",
    icon: "♻",
    badge: "ECOLOGICAL WASTE MANAGEMENT",
    features: [
      "Pencatatan setoran sampah anorganik dan organik secara terukur per siswa.",
      "Menumbuhkan budaya pilah sampah dan tanggung jawab lingkungan sejak dini.",
      "Perekapan akumulasi kilogram sampah terolah per kelas secara otomatis.",
      "Mendukung indikator penilaian sekolah adiwiyata dan akreditasi lingkungan."
    ]
  },
  perpus: {
    title: "Terminal Perpustakaan Digital",
    subtitle: "Registrasi kunjungan perpustakaan instan untuk meningkatkan literasi membaca siswa.",
    icon: "▤",
    badge: "DIGITAL LIBRARY TERMINAL",
    features: [
      "Proses pencatatan kunjungan perpus cepat dan praktis cukup dengan menempelkan kartu siswa.",
      "Menghilangkan pencatatan manual di buku tamu kertas yang sering hilang atau rusak.",
      "Analisis statistik grafik minat baca dan frekuensi kunjungan perpustakaan per kelas.",
      "Laporan terintegrasi untuk mendukung penilaian kinerja literasi sekolah."
    ]
  },
  ekskul: {
    title: "Presensi Ekskul & Otomatisasi eRapor",
    subtitle: "Perekapan aktivitas ekstrakurikuler yang langsung siap dimasukkan ke laporan pendidikan siswa.",
    icon: "⭐",
    badge: "EXTRACURRICULAR & RAPOR RECAP",
    features: [
      "Pencatatan presensi sesi kegiatan ekstrakurikuler sekolah secara tertib.",
      "Kalkulasi persentase kehadiran dan predikat keaktifan otomatis (Sangat Baik, Baik, Cukup, Kurang).",
      "Memudahkan Wali Kelas dalam menulis laporan perkembangan siswa tanpa rekapitulasi manual.",
      "Fitur eksport data resmi yang siap diserahkan ke Wali Kelas dan Kepala Sekolah."
    ]
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
            <img src="/logo.png" alt="AKSIS Logo" class="landing-logo-img" />
            <div class="landing-brand-text">
              <span class="brand-title">AKSIS</span>
              <span class="brand-sub">Smart School Ecosystem</span>
            </div>
          </a>

          <nav class="landing-nav">
            <a href="#fitur" class="landing-nav-link">Fitur Utama</a>
            <a href="#modul" class="landing-nav-link">Modul Fitur</a>
            <a href="#keunggulan" class="landing-nav-link">Keunggulan</a>
            <a href="#simulasi" class="landing-nav-link">Kalkulator</a>
            <a href="#kontak" class="landing-nav-link">Kontak</a>
          </nav>

          <div class="landing-actions">
            <button class="theme-toggle" id="landing-theme-toggle" title="Ubah Tema" aria-label="Ubah Tema">
              ${document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙"}
            </button>

            ${isLoggedIn 
              ? `<button class="button primary" id="btn-go-dashboard">Ke Dashboard <span>→</span></button>`
              : `<button class="button primary" id="btn-login-admin">Masuk <span>→</span></button>`
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
            <span>PLATFORM SEKOLAH CERDAS INTEGRATED IOT</span>
          </div>

          <h1 class="hero-title">
            Satu Kartu Pelajar Pintar untuk <span class="gradient-text">Seluruh Ekosistem Sekolah</span>
          </h1>

          <p class="hero-subtitle">
            AKSIS menghubungkan sistem presensi gerbang IoT real-time, pencetakan ID Card otomatis Dapodik, terminal bank sampah edukatif, presensi perpustakaan, hingga portal PWA orang tua dalam satu platform terpadu.
          </p>

          <!-- Hero Metrics Bar -->
          <div class="hero-metrics">
            <div class="metric-card">
              <span class="metric-value">&lt; 1 Detik</span>
              <span class="metric-label">Kecepatan Tap Presensi IoT</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-card">
              <span class="metric-value">100% Sync</span>
              <span class="metric-label">Terhubung Data Dapodik</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-card">
              <span class="metric-value">5 Modul</span>
              <span class="metric-label">Integrasi Aktivitas Sekolah</span>
            </div>
            <div class="metric-divider"></div>
            <div class="metric-card">
              <span class="metric-value">Otomatis</span>
              <span class="metric-label">Rekap Rapor Wali Kelas</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Feature Grid Section -->
      <section class="landing-section" id="fitur">
        <div class="section-head">
          <span class="eyebrow">SOLUSI TERLENGKAP SEKOLAH CERDAS</span>
          <h2>Mengapa Sekolah Menggunakan AKSIS?</h2>
          <p>Dirancang untuk meningkatkan efisiensi operasional, kedisiplinan siswa, dan mutu manajemen sekolah modern.</p>
        </div>

        <div class="feature-grid">
          <article class="feature-card">
            <div class="feature-icon sage">💳</div>
            <h3>Smart ID Card Multiguna</h3>
            <p>Satu kartu identitas siswa elegan yang terintegrasi dengan presensi gerbang, perpustakaan, bank sampah, dan aktivitas ekstrakurikuler.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon lime">🚪</div>
            <h3>Presensi Gerbang IoT & Display LED</h3>
            <p>Pencatatan kehadiran masuk & pulang super cepat bebas antrean, terhubung langsung dengan papan informasi LED gerbang sekolah.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon blue">♻</div>
            <h3>Bank Sampah Edukatif</h3>
            <p>Mendorong karakter peduli lingkungan hidup. Pencatatan setoran sampah terpilah per kelas untuk mendukung sekolah hijau adiwiyata.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon sand">▤</div>
            <h3>Terminal Perpustakaan Digital</h3>
            <p>Registrasi kedatangan ke perpustakaan secara digital tanpa antrean dan buku tamu kertas, meningkatkan budaya literasi siswa.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon sage">⭐</div>
            <h3>Rekapitulasi Ekskul & eRapor</h3>
            <p>Penilaian predikat keaktifan ekskul otomatis yang memudahkan Wali Kelas dalam menulis laporan perkembangan pendidikan siswa.</p>
          </article>

          <article class="feature-card">
            <div class="feature-icon lime">🛡</div>
            <h3>Manajemen Data Aman & Terpusat</h3>
            <p>Sistem cloud terenkripsi yang memastikan seluruh data presensi dan aktivitas sekolah tersimpan rapi dan dapat diakses kapan saja.</p>
          </article>
        </div>
      </section>

      <!-- Interactive Module Showcase -->
      <section class="landing-section showcase-section" id="modul">
        <div class="section-head">
          <span class="eyebrow">MODUL LAYANAN AKSIS</span>
          <h2>Jelajahi Fitur & Keunggulan Layanan</h2>
          <p>Pilih modul di bawah untuk melihat rincian manfaat operasional bagi sekolah Anda.</p>
        </div>

        <div class="showcase-tabs">
          <button class="showcase-tab active" data-tab="idcard">💳 Smart ID Card</button>
          <button class="showcase-tab" data-tab="presensi">🚪 Presensi IoT & LED</button>
          <button class="showcase-tab" data-tab="sampah">♻ Bank Sampah</button>
          <button class="showcase-tab" data-tab="perpus">▤ Perpustakaan</button>
          <button class="showcase-tab" data-tab="ekskul">⭐ Ekskul & eRapor</button>
        </div>

        <div class="showcase-content-box" id="showcase-display">
          <!-- Dynamic Content Rendered By JS -->
        </div>
      </section>

      <!-- Competitive Advantage Section -->
      <section class="landing-section" id="keunggulan">
        <div class="section-head">
          <span class="eyebrow">NILAI TAMBAH MANAJEMEN SEKOLAH</span>
          <h2>Keunggulan Utama Platform AKSIS</h2>
          <p>Solusi terpadu yang memberikan manfaat nyata bagi Kepala Sekolah, Guru, Siswa, dan Orang Tua.</p>
        </div>

        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon sage">📈</div>
            <h3>Efisiensi Waktu & Beban Kerja Guru</h3>
            <p>Otomatisasi rekapitulasi kehadiran dan kegiatan ekskul menghemat puluhan jam kerja guru dan wali kelas setiap bulannya.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon lime">🎯</div>
            <h3>Peningkatan Kedisiplinan Siswa</h3>
            <p>Pencatatan presensi IoT gerbang yang transparan membentuk budaya hadir tepat waktu dan sikap bertanggung jawab pada siswa.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon blue">✨</div>
            <h3>Citra Sekolah Modern & Digital</h3>
            <p>Penggunaan Smart ID Card dan Display LED Gerbang memberikan kesan profesional dan modern bagi sekolah di mata masyarakat.</p>
          </div>
        </div>
      </section>

      <!-- Interactive Calculator Section -->
      <section class="landing-section calculator-section" id="simulasi">
        <div class="calculator-card">
          <div class="calculator-info">
            <span class="eyebrow">SIMULATOR EFISIENSI SEKOLAH</span>
            <h2>Kalkulator Efisiensi AKSIS</h2>
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

      <!-- Contact Section -->
      <section class="landing-section contact-section" id="kontak">
        <div class="section-head">
          <span class="eyebrow">KONSULTASI & LAYANAN SEKOLAH</span>
          <h2>Hubungi Tim AKSIS</h2>
          <p>Kami siap membantu dan berkonsultasi mengenai implementasi sistem sekolah cerdas di sekolah Anda.</p>
        </div>

        <div class="contact-grid">
          <a href="https://wa.me/6282293479347?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20layanan%20sekolah%20cerdas%20untuk%20sekolah%20kami." target="_blank" rel="noopener noreferrer" class="contact-card whatsapp">
            <div class="contact-card-icon">💬</div>
            <div class="contact-card-info">
              <span class="contact-card-label">WhatsApp Official</span>
              <strong class="contact-card-value">+62 822-9347-9347</strong>
              <span class="contact-card-action">Hubungi via WhatsApp &rarr;</span>
            </div>
          </a>

          <a href="mailto:info@aksis.co.id" class="contact-card email">
            <div class="contact-card-icon">✉</div>
            <div class="contact-card-info">
              <span class="contact-card-label">Email Respon Cepat</span>
              <strong class="contact-card-value">info@aksis.co.id</strong>
              <span class="contact-card-action">Kirim Email Konsultasi &rarr;</span>
            </div>
          </a>
        </div>
      </section>

      <!-- Floating WhatsApp Button -->
      <a href="https://wa.me/6282293479347?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20layanan%20sekolah%20cerdas%20untuk%20sekolah%20kami." target="_blank" rel="noopener noreferrer" class="floating-wa-btn" title="Chat WhatsApp +62 822-9347-9347">
        <span class="wa-btn-icon">💬</span>
        <span class="wa-btn-text">Chat WhatsApp</span>
      </a>

      <!-- Footer CTA -->
      <footer class="landing-footer">
        <div class="footer-top">
          <div class="footer-brand">
            <img src="/logo.png" alt="AKSIS" class="footer-logo" />
            <h3>AKSIS</h3>
            <p>Ekosistem Digital Sekolah Cerdas & Integrated Smart ID Card Pelajar Indonesia.</p>
          </div>

          <div class="footer-links">
            <div class="link-group">
              <h4>Navigasi Layanan</h4>
              <a href="#fitur">Fitur Utama</a>
              <a href="#modul">Modul Layanan</a>
              <a href="#keunggulan">Keunggulan AKSIS</a>
              <a href="#simulasi">Kalkulator Efisiensi</a>
            </div>

            <div class="link-group">
              <h4>Hubungi Kami</h4>
              <a href="https://wa.me/6282293479347?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20layanan%20sekolah%20cerdas%20untuk%20sekolah%20kami." target="_blank" rel="noopener noreferrer">💬 +62 822-9347-9347</a>
              <a href="mailto:info@aksis.co.id">✉ info@aksis.co.id</a>
              <a href="/login" id="footer-login">Portal Masuk Admin</a>
            </div>

            <div class="link-group">
              <h4>Platform AKSIS</h4>
              <p class="domain-badge">Smart School Ecosystem</p>
              <small>Hak Cipta &copy; 2026 AKSIS Platform. Seluruh Hak Dilindungi Undang-Undang.</small>
            </div>
          </div>
        </div>

        <div class="footer-bottom">
          <p>AKSIS &mdash; Solusi Presensi IoT, Smart ID Card, dan Ekosistem Sekolah Terpadu.</p>
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
          <a href="https://wa.me/6282293479347?text=Halo%20AKSIS,%20saya%20tertarik%20dengan%20modul%20${encodeURIComponent(data.title)}." target="_blank" rel="noopener noreferrer" class="button primary">Konsultasi Modul Ini <span>→</span></a>
        </div>
      </div>

      <div class="showcase-visual">
        <div class="visual-glass-card">
          <div class="visual-header">
            <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
            <span class="visual-title">AKSIS &bull; ${data.title}</span>
          </div>
          <div class="visual-body">
            <div class="visual-mock-badge">${data.icon}</div>
            <h4>${data.title}</h4>
            <p>Terintegrasi secara otomatis dengan database sekolah & ekosistem terpadu.</p>
            <div class="visual-stat-row">
              <div><span>Status</span><strong>ONLINE &bull; READY</strong></div>
              <div><span>Integrasi</span><strong>100% Real-time</strong></div>
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
  const handleDashboard = (e: Event) => { e.preventDefault(); navigate("/"); };

  document.getElementById("btn-login-admin")?.addEventListener("click", handleLogin);
  document.getElementById("footer-login")?.addEventListener("click", handleLogin);

  document.getElementById("btn-go-dashboard")?.addEventListener("click", handleDashboard);
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
