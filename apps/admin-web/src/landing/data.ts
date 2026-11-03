import type { ShowcaseModule, ShowcaseModuleKey } from "./types";

export const showcaseModules: Record<ShowcaseModuleKey, ShowcaseModule> = {
  idcard: {
    id: "idcard",
    title: "Smart ID Card Pelajar Serbaguna",
    subtitle: "Kartu identitas resmi siswa yang serbaguna, elegan, dan terintegrasi dengan seluruh fasilitas sekolah.",
    icon: "💳",
    badge: "KARTU PINTAR TERINTEGRASI",
    features: [
      "Satu kartu untuk presensi gerbang, perpustakaan, bank sampah, hingga kegiatan ekstrakurikuler.",
      "Desain kartu pintar berkualitas tinggi yang tahan lama dan berstandar nasional.",
      "Sinkronisasi otomatis dengan data Dapodik sekolah untuk akurasi identitas siswa.",
      "Memudahkan manajemen sekolah dalam mengelola data induk siswa secara terpusat."
    ],
    statusLabel: "ONLINE • READY",
    metricBadge: "100% Real-time"
  },
  presensi: {
    id: "presensi",
    title: "Presensi Gerbang IoT Real-time & Display LED",
    subtitle: "Sistem pencatatan kehadiran gerbang otomatis yang cepat, akurat, dan transparan.",
    icon: "🚪",
    badge: "IOT GATE SYSTEM & LED DISPLAY",
    features: [
      "Kecepatan pemindaian presensi di bawah 1 detik tanpa memicu antrean di gerbang sekolah.",
      "Terhubung langsung dengan tampilan papan LED Board gerbang untuk pesan menyambut siswa.",
      "Pencatatan waktu hadir & pulang secara akurat untuk memupuk kedisiplinan siswa.",
      "Menghemat waktu piket guru dan memberikan laporan presensi yang transparan."
    ],
    statusLabel: "GATE ONLINE",
    metricBadge: "< 1 Detik Tap"
  },
  sampah: {
    id: "sampah",
    title: "Bank Sampah Edukatif Sekolah",
    subtitle: "Program sekolah hijau yang membangun karakter kepedulian lingkungan hidup siswa secara nyata.",
    icon: "♻",
    badge: "ECOLOGICAL WASTE MANAGEMENT",
    features: [
      "Pencatatan setoran sampah anorganik dan organik secara terukur per siswa.",
      "Menumbuhkan budaya pilah sampah dan tanggung jawab lingkungan sejak dini.",
      "Perekapan akumulasi kilogram sampah terolah per kelas secara otomatis.",
      "Mendukung indikator penilaian sekolah adiwiyata dan akreditasi lingkungan."
    ],
    statusLabel: "PROGRAM ADIWIYATA",
    metricBadge: "Edukatif & Terukur"
  },
  perpus: {
    id: "perpus",
    title: "Terminal Perpustakaan Digital",
    subtitle: "Registrasi kunjungan perpustakaan instan untuk meningkatkan literasi membaca siswa.",
    icon: "▤",
    badge: "DIGITAL LIBRARY TERMINAL",
    features: [
      "Proses pencatatan kunjungan perpus cepat dan praktis cukup dengan menempelkan kartu siswa.",
      "Menghilangkan pencatatan manual di buku tamu kertas yang sering hilang atau rusak.",
      "Analisis statistik grafik minat baca dan frekuensi kunjungan perpustakaan per kelas.",
      "Laporan terintegrasi untuk mendukung penilaian kinerja literasi sekolah."
    ],
    statusLabel: "LITERASI AKTIF",
    metricBadge: "Buku Tamu Digital"
  },
  ekskul: {
    id: "ekskul",
    title: "Presensi Ekskul & Otomatisasi eRapor",
    subtitle: "Perekapan aktivitas ekstrakurikuler yang langsung siap dimasukkan ke laporan pendidikan siswa.",
    icon: "⭐",
    badge: "EXTRACURRICULAR & RAPOR RECAP",
    features: [
      "Pencatatan presensi sesi kegiatan ekstrakurikuler sekolah secara tertib.",
      "Kalkulasi persentase kehadiran dan predikat keaktifan otomatis (Sangat Baik, Baik, Cukup, Kurang).",
      "Memudahkan Wali Kelas dalam menulis laporan perkembangan siswa tanpa rekapitulasi manual.",
      "Fitur eksport data resmi yang siap diserahkan ke Wali Kelas dan Kepala Sekolah."
    ],
    statusLabel: "RAPOR READY",
    metricBadge: "Otomatisasi Nilai"
  }
};
