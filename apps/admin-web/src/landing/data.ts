import type { ShowcaseModule, ShowcaseModuleKey, StakeholderBenefit } from "./types";

export const showcaseModules: Record<ShowcaseModuleKey, ShowcaseModule> = {
  idcard: {
    id: "idcard",
    title: "Smart ID Card Pelajar Serbaguna",
    subtitle: "Satu kartu identitas fisik terintegrasi Dapodik untuk seluruh fasilitas dan aktivitas sekolah.",
    icon: "💳",
    badge: "SATU KARTU SELURUH EKOSISTEM",
    features: [
      "Sinkronisasi otomatis dengan data Dapodik Kemendikbudristek tanpa entri manual berulang.",
      "Desain kartu pintar berkualitas tinggi standar nasional, tahan lama, dan dilengkapi QR Code unik.",
      "Dapat digunakan di pintu gerbang, perpustakaan, bank sampah, ekskul, hingga penautan orang tua.",
      "Dukungan pencetakan massal per kelas atau cetak kartu pengganti satuan secara mandiri."
    ],
    statusLabel: "ONLINE • READY",
    metricBadge: "100% Real-time"
  },
  presensi: {
    id: "presensi",
    title: "Presensi Gerbang IoT, LED Display & Suara Alami",
    subtitle: "Pencatatan presensi kilat bebas antrean dengan umpan balik suara manusia dan display LED gerbang.",
    icon: "🚪",
    badge: "IOT GATE SYSTEM & NATURAL VOICE",
    features: [
      "Kecepatan scan di bawah 1 detik per siswa, mampu melayani ribuan siswa saat pagi hari.",
      "Umpan balik suara alami manusia (Natural Voice) menyapa ramah siswa: 'Selamat Pagi, [Nama]!'.",
      "Terhubung langsung dengan Display LED Matrix gerbang untuk menampilkan sapaan visual seketika.",
      "Ketahanan offline hingga 7 hari berkat antrean IndexedDB lokal; sinkronisasi otomatis saat online."
    ],
    statusLabel: "GATE ONLINE",
    metricBadge: "< 1 Detik Tap"
  },
  parent: {
    id: "parent",
    title: "Portal PWA Orang Tua Siswa Real-time",
    subtitle: "Keluarga terhubung langsung dengan aktivitas dan kedisiplinan anak di sekolah tanpa aplikasi ribet.",
    icon: "📱",
    badge: "PORTAL KELUARGA & WALI MURID",
    features: [
      "Notifikasi instan jam kedatangan dan kepulangan anak di pintu gerbang sekolah.",
      "Akses mudah tanpa password rumit: login cukup memasukkan NISN dan Tanggal Lahir siswa.",
      "Transparansi saldo tabungan bank sampah, status buku perpustakaan, dan keaktifan ekskul anak.",
      "Teknologi PWA modern: langsung pasang di layar utama HP tanpa perlu unduh dari Play Store/App Store."
    ],
    statusLabel: "LIVE SYNC",
    metricBadge: "0ms Akses Cepat"
  },
  sampah: {
    id: "sampah",
    title: "Bank Sampah Edukatif Sekolah Adiwiyata",
    subtitle: "Membangun karakter peduli lingkungan hidup melalui aksi pilah dan setor sampah terukur.",
    icon: "♻",
    badge: "ECOLOGICAL WASTE & ADIWIYATA",
    features: [
      "Pencatatan setoran sampah terpilah (plastik, kertas, logam, organik) secara terukur per siswa.",
      "Konversi otomatis setoran sampah menjadi poin dan saldo tabungan siswa.",
      "Perekapan akumulasi kilogram sampah per kelas untuk mendukung indikator sekolah Adiwiyata.",
      "Mengajarkan literasi finansial dan tanggung jawab kelestarian alam sejak dini."
    ],
    statusLabel: "PROGRAM ADIWIYATA",
    metricBadge: "Edukatif & Terukur"
  },
  perpus: {
    id: "perpus",
    title: "Terminal Perpustakaan Digital & Sirkulasi Mandiri",
    subtitle: "Kios registrasi kunjungan dan sirkulasi peminjaman buku instan untuk memacu literasi siswa.",
    icon: "▤",
    badge: "DIGITAL LIBRARY & LITERACY",
    features: [
      "Presensi kedatangan perpustakaan cepat cukup dengan sekali tap Smart ID Card siswa.",
      "Menggantikan buku tamu kertas yang rentan rusak dengan database kunjungan digital yang rapi.",
      "Pencatatan peminjaman & pengembalian buku mandiri dengan pengingat batas waktu pengembalian.",
      "Grafik analitik minat baca dan frekuensi kunjungan per kelas untuk evaluasi literasi sekolah."
    ],
    statusLabel: "LITERASI AKTIF",
    metricBadge: "Buku Tamu Digital"
  },
  ekskul: {
    id: "ekskul",
    title: "Presensi Ekskul & Otomatisasi e-Rapor",
    subtitle: "Perekapan kehadiran kegiatan ekstrakurikuler yang langsung terkonversi ke nilai predikat rapor.",
    icon: "⭐",
    badge: "EXTRACURRICULAR & RAPOR RECAP",
    features: [
      "Pencatatan absensi sesi kegiatan ekstrakurikuler sekolah secara cepat oleh guru pembina.",
      "Kalkulasi persentase kehadiran dan konversi predikat otomatis (Sangat Baik, Baik, Cukup, Kurang).",
      "Memudahkan Wali Kelas menulis perkembangan siswa tanpa perlu mengumpulkan kertas absen manual.",
      "Fitur ekspor laporan resmi dalam format CSV/Excel siap pakai untuk rapat kenaikan kelas."
    ],
    statusLabel: "RAPOR READY",
    metricBadge: "Otomatisasi Nilai"
  },
  command: {
    id: "command",
    title: "Command Center TV & Monitoring Eksekutif",
    subtitle: "Layar monitoring operasional real-time di ruang Kepala Sekolah dan lobi utama.",
    icon: "🖥",
    badge: "EXECUTIVE MONITORING & IOT CONSOLE",
    features: [
      "Tampilan monitor TV interaktif dengan refresh otomatis setiap 30 detik tanpa beban server.",
      "Grafik kehadiran gerbang hari ini secara langsung, persentase hadir tepat waktu, dan keterlambatan.",
      "Ringkasan KPI harian dari 4 terminal sekaligus: Gerbang, Bank Sampah, Perpustakaan, dan Ekskul.",
      "Pills indikator status kesehatan koneksi perangkat (FRESH, STALE, OFFLINE) untuk respon cepat."
    ],
    statusLabel: "COMMAND TV ON",
    metricBadge: "Live 30s Refresh"
  }
};

export const stakeholderBenefits: StakeholderBenefit[] = [
  {
    role: "Orang Tua / Wali Murid",
    icon: "👨‍👩‍👧",
    tagline: "Ketenangan hati dengan kepastian kehadiran anak",
    benefits: [
      "Menerima konfirmasi instan saat anak tiba di sekolah dan saat jam kepulangan.",
      "Memantau tabungan bank sampah edukatif dan buku bacaan yang dipinjam anak.",
      "Melihat keaktifan ekstrakurikuler tanpa perlu konfirmasi manual ke guru.",
      "Dapat diakses dari ponsel apa pun tanpa memori aplikasi yang berat."
    ],
    themeColorClass: "sage"
  },
  {
    role: "Guru Piket & Satpam",
    icon: "👨‍🏫",
    tagline: "Presensi gerbang kilat, tertib, dan bebas antrean",
    benefits: [
      "Kecepatan pemindaian < 1 detik dengan panduan suara manusia yang ramah.",
      "Sistem tetap berfungsi 100% saat jaringan seluler di gerbang mati atau listrik padam.",
      "Display LED gerbang menyapa siswa secara visual untuk menanamkan budaya disiplin.",
      "Sinkronisasi otomatis ke cloud tanpa perlu rekapitulasi buku absen kertas."
    ],
    themeColorClass: "lime"
  },
  {
    role: "Wali Kelas & Pembina Ekskul",
    icon: "👩‍🏫",
    tagline: "Menghemat puluhan jam kerja rekap absensi & rapor",
    benefits: [
      "Data presensi harian siswa langsung tersaji per kelas dan terhitung otomatis.",
      "Presensi ekskul otomatis dikonversi ke predikat rapor (Sangat Baik, Baik, Cukup, Kurang).",
      "Cukup satu klik untuk mencetak atau mengunduh laporan perkembangan siswa.",
      "Fokus mendidik lebih banyak, beban administratif berkurang drastis."
    ],
    themeColorClass: "blue"
  },
  {
    role: "Kepala Sekolah & Manajemen",
    icon: "👔",
    tagline: "Kendali mutu sekolah modern & data akreditasi siap saji",
    benefits: [
      "Command Center TV live monitoring di ruang kerja menampilkan KPI sekolah setiap detik.",
      "Data dukung lengkap untuk penilaian akreditasi sekolah Adiwiyata dan literasi.",
      "Meningkatkan citra dan prestise sekolah sebagai pelopor ekosistem digital cerdas.",
      "Pengambilan keputusan berbasis data kehadiran dan kedisiplinan yang transparan."
    ],
    themeColorClass: "sand"
  }
];
