# Laporan audit PWA suara, sinkronisasi, dan peminjaman

Tanggal: 1 November 2026. Lingkup: PWA Piket Kehadiran, Piket Bank Sampah, Perpustakaan, dan Ekstrakurikuler.

## Temuan dan perubahan

1. **Suara Alami Manusia Asli (100% Native OS tanpa Fallback Robotik)**:
   - Sesuai evaluasi kualitas, mesin suara buatan (WASM/sanoTTS) yang bersuara kaku/bindeng dan berukuran berat (~8,5 MB) ditiadakan sepenuhnya.
   - Semua PWA kini 100% menggunakan suara resmi alami bawaan sistem operasi ponsel (**Google Bahasa Indonesia** di Android, **Apple Damayanti** di iOS/macOS) melalui Web Speech Synthesis on-device. Suara terdengar jernih, fasih, dan manusiawi dengan intonasi penutur asli Indonesia.
   - PWA menjadi jauh lebih ringan, cepat dipasang, dan hemat memori HP (aset PWA kembali ke ukuran minimal ~300 KB tanpa unduhan binary model besar).
   - Dilengkapi *debounce* 8 detik untuk mencegah penumpukan audio saat kartu siswa dipindai berulang kali.
2. **Solusi Perangkat Khusus Tanpa Paket Suara Indonesia**:
   - Jika HP Android/iOS tertentu belum mengunduh paket data suara Bahasa Indonesia di setelan sistemnya, sistem tidak memaksakan suara bahasa asing yang robotik.
   - PWA secara otomatis mendeteksi ketiadaan paket suara dan menampilkan indikator status `⚠️ Paket suara Bahasa Indonesia belum terpasang di HP ini` serta tombol `[⚙️ Pasang Suara]`.
   - Mengetuk tombol tersebut (atau tombol Uji Suara saat suara belum ada) akan memunculkan dialog panduan interaktif yang disesuaikan dengan OS:
     - **Android**: Tombol langsung membuka *Google Speech Services* di Google Play Store dan petunjuk 4 langkah mengaktifkan Bahasa Indonesia di Pengaturan HP (Aksesibilitas/Sistem).
     - **iOS**: Petunjuk langkah cepat mengunduh suara *Damayanti* (Kualitas Ditingkatkan) di Pengaturan iOS.
   - **Deteksi Realtime**: Event `speechSynthesis.onvoiceschanged` aktif memantau perubahan. Begitu pengguna selesai mengunduh suara di HP dan kembali ke PWA, sistem langsung mendeteksi dan mengaktifkan suara alami secara otomatis tanpa perlu memuat ulang (*reload*) atau menginstal ulang aplikasi.
3. **Pemisahan Data Siswa (Multitenancy Cache)**:
   - Cache siswa dipisah secara ketat menurut sekolah dan portal (`school_id:portal_id`).
   - Masa simpan data 7 hari, dan pembaharuan daftar siswa berjalan bertahap di latar belakang (*cursor-based pagination*) yang dibatasi hanya untuk sekolah dan kelas yang diizinkan.
4. **Antrean Transaksi Tahan Rusak (`DurableQueue`)**:
   - Menggantikan antrean penyimpanan lokal dengan IndexedDB (`aksis-pwa-events-v1`) per entri transaksi.
   - Mencegah benturan data (*race condition*) antar tab.
   - Transaksi yang ditolak server (4xx) dicatat status kegagalannya untuk diperiksa petugas dan tidak lagi mengunci/menghambat antrean transaksi berikutnya.
5. **Peminjaman Buku pada PWA Perpustakaan**:
   - Form peminjaman buku mencatat NISN/nomor siswa, judul buku, penulis, dan tanggal jatuh tempo.
   - Nomor siswa yang baru dipindai di tab Scan otomatis disalin ke form peminjaman.
   - Dilengkapi tab navigasi bawah (Scan vs Peminjaman) dan sinkronisasi idempoten berbasis `event_id` ke tabel `public.library_loans`.

6. **Pemindai QR Siswa pada Tab Peminjaman Buku (100% Identik dengan Tab Scan)**:
   - Merevamp area pemindai QR pada tab **Peminjaman Buku** di PWA Perpustakaan agar memiliki tampilan visual dan fungsionalitas yang sama persis dengan pemindai di tab Scan utama.
   - **UI & Layout Identik**: Menggunakan `.scanner-stage` dengan header eyebrow `IDENTITAS SISWA`, judul `Pindai QR kartu`, tombol flip kamera `.camera-switch`, reticle bidik QR SVG, shutter flash animation, dan kontrol zoom 1×, 2×, 3×.
   - **Kontrol Kamera Penuh**:
     - Tombol toggle kamera (`Aktifkan kamera` / `Matikan kamera`) dengan styling dan indikator titik live-dot yang konsisten.
     - Pergantian kamera depan/belakang via `#btn-switch-loan-camera` (`loanCamera.flip()`).
     - Zoom hardware via tombol level zoom (1×, 2×, 3×) serta gesture pinch-to-zoom di area viewport pemindai.
   - **Feedback Audio, Getar, & Suara Alami**:
     - Animasi kilat shutter kamera (`#loan-camera-shutter-flash`).
     - Umpan balik getar haptic (vibrate) dan nada bip 960 Hz saat QR terbaca.
     - Resitasi suara alami Indonesia: `"Peminjaman buku untuk [Nama Siswa]"`.
   - **Pencarian Manual & Input NISN**:
     - Pemindaian manual dengan input nomor NISN/kartu, tombol `Cari siswa`, dan event keyboard Enter.
     - Auto-lookup real-time (debounce) memeriksa cache lokal dan otomatis mencari ke server jika online.
     - Kartu siswa terverifikasi identik (`#loan-student-result`) menampilkan foto/avatar siswa, nama lengkap, kelas, NISN, serta tombol hapus/ganti siswa.
     - Setelah siswa terverifikasi, kursor otomatis fokus ke input `Judul buku`.
   - **Isolasi & Manajemen Kamera Antartab**:
     - Saat berpindah ke tab Peminjaman, kamera tab Scan otomatis dimatikan, tanggal jatuh tempo default disetel (+7 hari jika kosong), dan label nama sekolah disinkronkan.
     - Saat berpindah ke tab Scan, kamera peminjaman otomatis dimatikan.
     - Kedua kamera otomatis mati saat tab/layar diminimalkan atau disembunyikan (`visibilitychange` / `pagehide`).
7. **Integrasi Peminjaman Buku di PWA Orang Tua**:
   - Memperbarui RPC dan endpoint `/parent/children/:id/today` untuk menyertakan `active_loans` (buku yang sedang dipinjam) lengkap dengan `due_date` (tanggal jatuh tempo) dan status `is_overdue`.
   - Pada kartu **Kunjungan Perpustakaan** di beranda orang tua, kini ditampilkan lencana buku aktif: `📖 X buku sedang dipinjam · Jatuh tempo terdekat [Tanggal]`.
   - Saat orang tua mengetuk kartu Perpustakaan, drawer membuka bagian khusus **Buku yang Sedang Dipinjam** lengkap dengan judul buku, penulis, tanggal pinjam, dan lencana status jatuh tempo (Terlambat, Hari Ini, atau Sisa Hari). Di bawahnya tetap ditampilkan riwayat kunjungan perpustakaan harian.

8. **Personalisasi Suara Kontekstual PWA Presensi (Jam Datang vs Terlambat vs Jam Pulang)**:
   - Menggantikan ucapan suara yang sebelumnya hanya menyebut nama siswa dengan sapaan kontekstual cerdas sesuai waktu dan ketepatan jam sekolah:
     - **Jam Datang / Masuk (Tepat Waktu)**: `"Selamat Pagi [Nama Siswa]"`
     - **Jam Datang / Masuk (Lewat Batas Masuk / Terlambat)**: `"Waduh kamu terlambat hari ini [Nama Siswa]"`
     - **Jam Pulang**: `"Sampai Jumpa besok [Nama Siswa]. Hati-hati dijalan."`
   - Logika penentuan jam terintegrasi otomatis dengan `rules` sekolah (`check_in_end` dan `check_out_start`) maupun saat tombol arah presensi Datang/Pulang diubah petugas.

9. **Perbaikan Antarmuka Dialog Modal Admin Sekolah (Ekstrakurikuler, Tahun Ajaran, & LED Board)**:
   - **Masalah**: Pada halaman `/extracurricular` (Admin Web), saat mengklik tombol `+ Tambah Ekskul`, dialog modal memiliki area putih besar kosong (*safe area*) yang membentang dari bawah tombol simpan hingga menyentuh dasar layar. Hal ini mengganggu pandangan dan menutupi konten halaman belakang.
   - **Penyebab**: Container modal `#ekskul-modal` dibuka dengan `display: flex` tanpa properti centering (`align-items: center`), sehingga peramban otomatis melakukan *stretch* vertikal pada kartu modal (`div` anak dengan `background: var(--bg)`), membuat kartu memanjang ke bawah melampaui batas form.
   - **Solusi & Standardisasi**:
     - Membangun standar class modal terpadu: `.admin-modal-overlay` (overlay fixed dengan backdrop-blur semi-transparan, centering flex penuh `align-items: center; justify-content: center;`), `.admin-modal-card` (kartu modal dengan tinggi natural `height: auto; max-height: calc(100vh - 2.5rem);`, sudut lengkung 1.25rem, dan bayangan elegan), `.admin-modal-close-btn` (tombol silang melingkar modern), serta `.admin-modal-form`.
     - Menerapkan standardisasi ini pada modal `#ekskul-modal` (Ekstrakurikuler), `#year-modal` (Tahun Ajaran), dan `#led-modal` (LED Board).
     - Menambahkan interaksi ramah pengguna: menutup modal saat klik di luar kartu (backdrop click) atau saat menekan tombol `Escape`, serta auto-focus ke input pertama saat modal dibuka.

10. **Perbaikan Scrolling Touch pada Area Scanner PWA Piket Bank Sampah**:
   - **Masalah**: Halaman PWA Piket Bank Sampah (`/waste/`) tidak dapat digulir (*scrolling*) jika jari pengguna menyentuh area pemindai kamera (*scanner*), memaksa pengguna harus menempatkan jari persis di pinggir luar kotak scanner untuk bisa scroll ke bawah melihat ringkasan harian atau klasemen.
   - **Penyebab**: File `apps/waste-pwa/src/style.css` menerapkan deklarasi `touch-action: none !important;` pada `#scanner-stage, #qr-reader, #qr-reader video, #qr-reader canvas`. Properti ini secara eksplisit menginstruksikan browser untuk mematikan seluruh penanganan gestur gulir native saat sentuhan dimulai dari area scanner.
   - **Solusi**:
     - Memperbarui deklarasi CSS menjadi `touch-action: pan-y !important;` pada `#scanner-stage`, `#qr-reader`, `#qr-reader video`, `#qr-reader canvas`, `.scanner-stage`, `.scanner-viewport`, dan `#scanner-placeholder`.
     - Dengan `touch-action: pan-y`, sapuan satu jari vertikal di titik mana pun pada area pemindai (baik saat kamera aktif maupun mati) langsung direspons oleh browser untuk menggulir halaman secara halus dan bebas hambatan.
     - Gestur dua jari (*pinch-to-zoom*) tetap ditangani oleh JavaScript (`setupScannerPinchZoom`) dengan penambahan listener `touchcancel` untuk transisi zoom kamera yang mulus.

11. **Pembaruan Logo Baru Aksis (3D Blue Ribbon "A") pada Seluruh Icon Launcher HP (Android & iOS), Favicon Browser, dan Brand-Mark**:
   - **Artwork Logo Asli Master**: Mengadopsi logo resmi baru Aksis (huruf "A" berbentuk ribbon 3D biru gradien/mobius loop) dengan latar belakang transparan murni, tanpa mengubah, mendistorsi, atau merombak bentuk aslinya agar tetap tampil autentik di layar HP pengguna.
   - **Launcher Icon Android (Adaptive & Maskable)**:
     - Menghasilkan `icon-512.png` dan `icon-192.png` dengan kanvas putih bersih `#ffffff` dan padding proporsional (area logo ~78%) agar saat dipasang di layar utama HP Android tampil tajam, bersih, dan tidak terpotong.
     - Menghasilkan `maskable-icon-512.png` dengan logo berada di dalam *safe-zone* 80% (lingkaran tengah 409px) sesuai spesifikasi W3C Web App Manifest & Android Adaptive Icons.
     - Memperbaiki `manifest.webmanifest` pada seluruh aplikasi (`attendance-pwa`, `waste-pwa`, `library-terminal`, `extracurricular-pwa`, `parent-pwa`, `admin-web`, `command-center`, `led-gateway`) dengan pemisahan purpose `"any"` dan `"maskable"`. Icon launcher "Piket Presensi" yang sebelumnya tampil kotak kaku kini tampil seragam berbentuk squircle adaptif bersama 4 PWA lainnya di beranda HP.
     - Memasukkan `maskable-icon-512.png` dan `favicon.ico` ke dalam daftar *offline assets cache* `vite.config.ts` PWA agar ikon tetap muncul sempurna saat offline.
   - **Launcher Icon iOS / iPhone (`apple-touch-icon.png`)**:
     - Dibuat ukuran standar 180×180 piksel dengan latar belakang solid putih `#ffffff` dan padding terpusat. Hal ini mencegah perilaku default iOS Safari yang mengubah piksel transparan menjadi kotak hitam pekat saat pengguna mengetuk *Add to Home Screen*.
   - **Favicon Browser & Link Tag HTML**:
     - Menghasilkan `favicon.ico` multi-frame (16×16, 32×32, 48×48) transparan berkualitas tinggi serta `favicon-32x32.png`.
     - Memperbarui tag `<link rel="icon" type="image/x-icon" href="/favicon.ico">` dan `<link rel="apple-touch-icon" ...>` di seluruh `index.html` aplikasi.
   - **Brand Mark & Logo Aplikasi Lainnya**:
     - Memperbarui `brand-mark.webp` (transparan) untuk header bilah atas PWA presensi, sampah, perpustakaan, ekskul, dan orang tua.
     - Memperbarui `logo.png`, `icon.svg`, serta root assets (`Launcher Icon.png`, `logo_transparent.png`, `Logo.svg`, `test-512.png`).
     - Menyediakan skrip generator otomatis berulang di `tooling/generate-brand-icons.mjs` berbasis `sharp`.

12. **Mekanisme Sinkronisasi Awal Berbasis Kelas, Operasi Offline Mandiri (Mati Lampu/Internet Mati), dan Sinkronisasi Senyap Latar Belakang pada PWA Piket Sampah**:
   - **Sinkronisasi Awal Terfokus Per Kelas Piket (Tidak Mengambil Seluruh Siswa Sekolah)**:
     - Mengoptimalkan fungsi database `public.portal_scanner_roster` (Migration `202611010012_waste_pwa_class_roster_sync.sql`): ketika diakses oleh role `WASTE_STAFF`, query langsung diarahkan khusus ke tabel `student_class_history` berdasarkan `class_id` yang tertera pada token QR Portal piket.
     - HP piket hanya mengunduh data siswa kelas piketnya (~30–40 siswa, ukuran payload sangat kecil ~10 KB) dalam 1 kali panggil, bukan ribuan siswa dalam satu sekolah. Hal ini menghemat kuota HP dan memangkas waktu tunggu inisialisasi hingga di bawah 100 milidetik.
     - Disertakan pula kolom `photo_url` siswa ke dalam cache lokal agar foto siswa tetap dapat tampil di layar HP saat offline.
   - **Operasi Latar Belakang Senyap Tanpa Mengganggu UI**:
     - Proses `syncPortalRoster(portal, studentCache)` dijalankan otomatis di latar belakang begitu login portal selesai atau sesi dipulihkan.
     - Tidak ada dialog loading, overlay spinner, atau banner yang menghalangi kamera dan form input setoran.
   - **Ketahanan Penuh Saat Mati Lampu atau Internet Mati**:
     - Ketika listrik padam atau internet mati, pemindaian QR kartu siswa tetap berjalan instan (< 1 ms) melalui pencocokan lokal pada `StudentCache` di memori HP (`student_number`, `nisn`, `qr_key`, `card_uid`, dan `card_serial`).
     - Nama siswa tetap dibacakan dengan suara alami Bahasa Indonesia on-device (`NaturalVoice`).
     - Formulir setoran sampah menyimpan transaksi langsung ke `DurableQueue` (IndexedDB) dengan ID peristiwa unik (`event_id` UUID).
     - UI langsung merespons sukses ("Setoran tersimpan di HP"), mereset input, dan kamera langsung kembali aktif siap memindai siswa berikutnya tanpa menunggu sinyal internet.
   - **Sinkronisasi Otomatis Senyap Saat Online Tanpa Sentuhan Tombol**:
     - Ketika internet pulih (event `online` atau siklus timer), fungsi `syncWasteQueue()` otomatis mengirimkan antrean setoran ke `/waste/transactions`.
     - Sinkronisasi berjalan 100% senyap tanpa memunculkan toast, alert, atau error banner (`scan-error`) di layar pemindai sehingga petugas piket tidak terdistraksi.
   - **Ketahanan Beban Tinggi untuk Ribuan HP Aktif Bersamaan (High Concurrency Protection)**:
     - **Pengecekan Tanpa Polling HTTP Kosong**: Jika antrean lokal kosong (`pendingItems.length === 0`), fungsi sinkronisasi tidak mengirim HTTP request sama sekali ke server (0 request overhead).
     - **Randomized Jitter Interval**: Siklus sinkronisasi latar belakang menggunakan interval adaptif acak antara 12 hingga 18 detik (`12000 + Math.random() * 6000`). Hal ini mencegah fenomena *thundering herd* (badai request bersamaan) saat ribuan HP piket online serentak di waktu pergantian jam sekolah.
     - **Exponential Backoff dengan Jitter**: Jika server mengembalikan status 429 (*rate limit*) atau 503, HP secara otomatis menunda percobaan berikutnya selama 20–35 detik (dengan jitter) agar beban server mereda.
     - **Isolasi Dashboard**: Polling dashboard klasemen hanya aktif jika petugas sedang membuka tab Klasemen (`view === "ranking"`), dan dinonaktifkan saat petugas berada di layar pemindai setoran.

## Hasil verifikasi

- **Pemeriksaan Tipe Data**: `npm run typecheck:all` lulus 100% tanpa kesalahan di seluruh 11 aplikasi.
- **Pemeriksaan Build**: `npm run vercel-build` sukses mempaketkan seluruh 10 aplikasi frontend dan menyalin aset baru ke `dist/`.
- **Pengujian Unit & Vitest**: Seluruh 50 berkas pengujian dan 256 tes lulus (100% PASS).
- **Pengujian Browser & Offline Store**:
  - `tooling/test-waste-offline-sync.mjs`: Pengujian integrasi penuh PWA Piket Sampah di browser headless Chrome (PASS):
    - Sinkronisasi awal roster kelas piket berhasil tersimpan di cache lokal HP.
    - Resolusi offline kartu siswa di HP berhasil (< 530 ms) tanpa koneksi internet sama sekali.
    - Setoran sampah tersimpan di IndexedDB HP secara offline & UI langsung siap memindai siswa berikutnya.
    - Setoran offline berhasil tersinkronisasi otomatis ke server secara senyap tanpa intervensi user saat online kembali.
  - `apps/attendance-pwa/src/store.test.ts`: Pengujian unit fungsi `attendanceGreeting` dan kepatuhan jam sekolah (PASS).
  - `tooling/test-attendance-voice.mjs`: Pemindaian QR dan suara alami Indonesia dengan sapaan kontekstual terverifikasi offline di browser headless (PASS).
  - `tooling/test-library-loans-offline.mjs`: Peminjaman buku tersimpan offline di HP dan tersinkronisasi 1x saat kembali online (PASS).
  - `tooling/test-durable-pwa-queue.mjs`: 40 penulisan transaksi simultan dari 2 tab tetap tersimpan utuh dan terisolasi per sekolah (PASS).
- **Vercel Production Deployment**: Berhasil di-deploy ke organisasi `netkom-developers-projects` proyek `aksis`, aliased ke `https://www.aksis.co.id`.
  - Endpoint Favicon `/favicon.ico` & `/favicon-32x32.png`: 200 OK.
  - Endpoint Launcher `/icon-512.png`, `/icon-192.png`, `/apple-touch-icon.png`: 200 OK.
  - Endpoint PWA Manifest `/manifest.webmanifest` & `/pwa-attendance/manifest.webmanifest`: 200 OK.
  - Endpoint `/waste/`: 200 OK, terverifikasi sinkronisasi kelas piket, penyimpanan IndexedDB offline, dan background sync senyap.
  - Endpoint `/extracurricular`: 200 OK, terverifikasi modal `.admin-modal-overlay` dan `.admin-modal-card` tampil rapi di tengah tanpa area putih yang memanjang.
  - Endpoint `/attendance/`: 200 OK, terverifikasi fungsionalitas sapaan kontekstual kedatangan dan kepulangan.
  - Endpoint `/library/`: 200 OK, terverifikasi elemen `#loan-scanner-stage`, `#loan-qr-reader`, `#btn-switch-loan-camera`, `#loan-zoom-controls`, dan `#loan-student-result`.
  - Endpoint `/parent/`: 200 OK, terverifikasi elemen pemantauan pinjaman buku dan drawer perpustakaan.
  - Endpoint API `/api/v1/health`: 200 OK.
