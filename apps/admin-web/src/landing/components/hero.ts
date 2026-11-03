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
  `;
}
