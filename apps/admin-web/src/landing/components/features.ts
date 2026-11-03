export function renderFeatures(): string {
  return `
    <!-- Feature Grid Section -->
    <section class="landing-section" id="fitur">
      <div class="section-head">
        <span class="eyebrow">FONDASI TEKNOLOGI SEKOLAH MODERN</span>
        <h2>Mengapa Sekolah Memilih AKSIS?</h2>
        <p>Dirancang khusus untuk iklim operasional sekolah Indonesia: cepat, tangguh saat offline, dan menghemat ratusan jam kerja guru.</p>
      </div>

      <div class="feature-grid">
        <article class="feature-card">
          <div class="feature-icon sage">💳</div>
          <h3>Smart ID Card Terhubung Dapodik</h3>
          <p>Satu kartu identitas pintar siswa yang tersinkronisasi otomatis dengan database resmi Dapodik untuk seluruh akses fasilitas sekolah.</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon lime">🚪</div>
          <h3>Presensi Gerbang IoT, LED & Suara Alami</h3>
          <p>Pencatatan hadir & pulang < 1 detik dengan umpan balik sapaan suara manusia yang ramah serta tampilan pesan di papan LED gerbang.</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon blue">📱</div>
          <h3>Portal PWA Orang Tua Siswa</h3>
          <p>Orang tua memantau kehadiran anak, saldo tabungan sampah, dan buku perpus secara real-time via ponsel tanpa perlu unduh aplikasi app store.</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon sand">📡</div>
          <h3>Offline-First Kiosk (Tahan Mati Sinyal)</h3>
          <p>Sistem scanner gerbang dan terminal tetap berfungsi 100% normal saat internet padam hingga 7 hari berkat antrean IndexedDB lokal.</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon sage">♻</div>
          <h3>Bank Sampah & Perpustakaan Digital</h3>
          <p>Pencatatan setoran sampah terpilah untuk mendukung sekolah hijau Adiwiyata dan otomasi sirkulasi peminjaman buku perpustakaan.</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon lime">🛡</div>
          <h3>Otomatisasi e-Rapor & Cloud Terenkripsi</h3>
          <p>Presensi ekskul otomatis terkonversi ke predikat rapor (Sangat Baik/Baik/Cukup) dengan proteksi data sekolah standar enterprise.</p>
        </article>
      </div>
    </section>
  `;
}
