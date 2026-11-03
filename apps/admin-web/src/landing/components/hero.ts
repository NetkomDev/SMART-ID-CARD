export function renderHero(): string {
  return `
    <section class="landing-hero">
      <div class="landing-hero-bg">
        <div class="glow-orb orb-1"></div>
        <div class="glow-orb orb-2"></div>
      </div>

      <div class="landing-hero-content">
        <div class="hero-badge">
          <span class="badge-dot"></span>
          <span>PLATFORM SEKOLAH CERDAS INTEGRATED IOT & PWA</span>
        </div>

        <h1 class="hero-title">
          Satu Kartu Pelajar Pintar untuk <span class="gradient-text">Seluruh Ekosistem Sekolah</span>
        </h1>

        <p class="hero-subtitle">
          AKSIS menghubungkan sistem presensi gerbang IoT bersuara alami, papan LED display, portal PWA orang tua siswa, bank sampah Adiwiyata, perpustakaan digital, hingga Command Center TV Kepala Sekolah dalam satu platform terpadu.
        </p>

        <div class="hero-cta-group">
          <a href="https://wa.me/6285694488510?text=Halo%20AKSIS,%20saya%20tertarik%20konsultasi%20implementasi%20ekosistem%20sekolah%20cerdas%20untuk%20sekolah%20kami." target="_blank" rel="noopener noreferrer" class="button primary hero-btn">Konsultasi Sekolah Cerdas <span>→</span></a>
          <a href="#modul" class="button secondary hero-btn">Jelajahi 7 Modul Layanan</a>
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
            <span class="metric-label">Terhubung Data Dapodik</span>
          </div>
          <div class="metric-divider"></div>
          <div class="metric-card">
            <span class="metric-value">7 Modul</span>
            <span class="metric-label">Integrasi Layanan Sekolah</span>
          </div>
          <div class="metric-divider"></div>
          <div class="metric-card">
            <span class="metric-value">Offline-Ready</span>
            <span class="metric-label">Ketahanan Kiosk 7 Hari</span>
          </div>
        </div>
      </div>
    </section>
  `;
}
