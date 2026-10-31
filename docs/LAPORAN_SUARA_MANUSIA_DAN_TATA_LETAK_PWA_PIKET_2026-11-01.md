# Laporan Implementasi Suara Alami Manusia & Pemindahan Card Suara Nama Siswa

Tanggal: 1 November 2026  
Aplikasi: PWA Piket Kehadiran (`apps/attendance-pwa`)

## 1. Latar Belakang & Masalah

Pengujian nyata pemindaian ID Card di lapangan menunjukkan bahwa:
1. Suara penyebutan nama siswa sebelumnya terdengar seperti robot (sintesis forman mekanik dari eSpeak NG 1.49.1), sehingga kurang nyaman dan kurang alami saat didengar oleh guru piket dan siswa di gerbang sekolah.
2. Posisi card "Suara nama siswa" sebelumnya berada di atas viewport kamera (`#scanner-stage`), sehingga mendorong area pemindai kamera terlalu ke bawah pada layar HP petugas.
3. Pengguna menginginkan suara yang dihasilkan mendekati atau mirip suara manusia asli, tetap dapat berjalan secara offline di perangkat HP petugas, serta memindahkan card "Suara nama siswa" ke bawah kolom input NISN manual.

## 2. Perubahan yang Dilakukan

### A. Tata Letak Card "Suara nama siswa" (`index.html` & `style.css`)
- Memindahkan elemen `<section class="voice-panel" aria-label="Suara nama siswa">` dari bagian atas viewport kamera (`#scanner-stage`) ke posisi tepat di bawah form input manual NISN (`#form-scan`) dan di atas daftar riwayat pindai (`.history-section`).
- Menyesuaikan margin ritme vertikal `.voice-panel` menjadi `margin: 14px 0; box-shadow: 0 2px 6px rgba(0,0,0,0.02);` agar selaras dengan kotak input NISN di atasnya dan riwayat presensi di bawahnya.
- Viewport kamera pemindai ID Card kini berada langsung di bawah indikator arah presensi dan banner umpan balik, memberikan pandangan kamera yang lebih lapang dan ergonomis bagi petugas saat memegang smartphone.

### B. Mesin Suara Alami Manusia (`offline-voice.ts`)
- Menerapkan arsitektur suara hybrid cerdas:
  1. **Primary (Suara Alami Manusia)**: Menggunakan mesin suara bawaan perangkat (`window.speechSynthesis`) dengan deteksi otomatis paket suara Bahasa Indonesia berkualitas tinggi (`id-ID`, seperti *Google Bahasa Indonesia* pada Android dan *Damayanti* pada iOS/macOS).
     - Suara ini diproduksi langsung oleh OS di tingkat perangkat keras, menghasilkan intonasi vokal manusia asli yang hangat, fasih, dan natural tanpa efek robot.
     - **100% Offline & Hemat Data**: Memanfaatkan paket suara lokal yang sudah tertanam di HP (`localService: true`), sehingga tidak ada kuota unduhan file model neural berat (0 byte download tambahan) dan kecepatan sintesis instan tanpa latensi.
     - **Privasi Terjaga**: Nama siswa disintesis secara lokal di HP dan tidak pernah dikirim ke server pihak ketiga manapun.
     - Parameter artikulasi disesuaikan: kecepatan `rate: 0.96` dan nada `pitch: 1.0` untuk pembacaan nama siswa yang tegas, jelas, dan santun.
  2. **Fallback Lokal (Web Audio Buffer)**: Jika perangkat atau lingkungan uji headless tidak memiliki voice pack sistem Bahasa Indonesia, sistem secara otomatis beralih ke fallback worker lokal tanpa menghentikan fungsionalitas pemindaian presensi.
- Memperbarui antrean (*FIFO queue*) asinkron dengan penguncian aman (*watchdog timer* 6 detik) untuk memastikan penyebutan nama berurutan tidak saling tumpang tindih (*overlap*) saat beberapa siswa memindai kartu secara cepat berturut-turut.
- Menyediakan penanganan izin interaksi audio seluler (*audio unlock*) saat guru mengetuk "Aktifkan kamera", "Catat", atau tombol "Uji suara".

## 3. Hasil Pengujian & Verifikasi

1. **TypeScript Typecheck**:
   - `npm run typecheck:all` lulus tanpa error di seluruh 11 aplikasi monorepo AKSIS.
2. **Pengujian PWA Install & UI**:
   - `node tooling/test-attendance-install-prompt.mjs` lulus 100%. Tampilan card suara nama siswa terkonfirmasi berada tepat di bawah input manual NISN.
3. **Pengujian Suara & QR Decode**:
   - `node tooling/test-attendance-voice.mjs` lulus 100%. Terverifikasi bahwa nama siswa berhasil diproses dan antrean suara berurutan berjalan stabil.
4. **Build Produksi**:
   - `npm run vercel-build` berhasil mengompilasi dan mengemas 10 entrypoint frontend monorepo tanpa kendala.
