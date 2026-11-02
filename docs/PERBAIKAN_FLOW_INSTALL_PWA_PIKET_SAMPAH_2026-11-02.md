# Perbaikan Flow Install & Penarikan Roster PWA Piket Sampah

**Tanggal:** 2 November 2026  
**Aplikasi Terkait:** `apps/waste-pwa`, `apps/shared/install-prompt.ts`  
**Domain Target:** `https://www.aksis.co.id/waste`

---

## 1. Latar Belakang & Kebutuhan Pengguna
Petugas piket bank sampah sekolah membutuhkan alur kerja instalasi aplikasi dari pemindaian QR Portal yang lebih cepat, mulus, dan minim potensi kesalahan (human error), dengan tahapan terstandarisasi:
1. Scan QR Portal piket sampah.
2. Tampil PWA Piket Bank Sampah di browser.
3. Tampil popup instalasi aplikasi ke layar utama HP secara otomatis.
4. Setelah user membuka aplikasi dari ikon launcher di HP, aplikasi langsung terbuka (mode full-screen standalone) tanpa terhalang lagi oleh form QR atau popup install.
5. Penarikan data siswa hanya sesuai kelas portal PWA Piket Sampah yang discan (contoh: QR Portal kelas 4 hanya menarik data kelas 4 sekolah tersebut, terisolasi dari tenant/sekolah atau kelas lain) sehingga penarikan berlangsung instan.
6. Indikator melayang di tengah layar "Memproses..." memberi kejelasan visual kepada user selama proses penyiapan data.

---

## 2. Rincian Perubahan Implementasi

### A. Ekspor & Pemisahan Mode Launcher vs Browser (`apps/shared/install-prompt.ts`)
- Mengekspor fungsi `isInstalled()` untuk mendeteksi apakah PWA berjalan dalam mode standalone (`display-mode: standalone` atau iOS home-screen icon) vs browser tab biasa.
- Mengintegrasikan `promptOrOfferInstall()` agar otomatis memicu native prompt instalasi Chromium (`beforeinstallprompt`) atau modal panduan resmi AKSIS di peramban tanpa mengganggu user saat aplikasi telah terpasang di launcher.

### B. Indikator Melayang "Memproses..." (`apps/waste-pwa/src/style.css` & `index.html`)
- Memperbarui styling `.loading-overlay-container` dan `.loading-toast-card` dengan palet hijau hutan (*forest green* `#163e2c` hingga `#0e291d`), bayangan lembut (*ambient elevation*), frosted blur backdrop, spinner hijau mint `#63ef8d`, dan teks *"Memproses..."* yang melayang presisi di tengah layar HP.
- Mengembangkan fungsi `showLoadingOverlay(show: boolean, text = "Memproses...")` di `apps/waste-pwa/src/main.ts` agar dapat mengubah teks dan menampilkan/menyembunyikan overlay dengan transisi halus.

### C. Alur Sinkronisasi Roster Kelas Terisolasi (`apps/waste-pwa/src/main.ts`)
- Pada saat portal diinisialisasi (`setupUI`):
  1. Tampilkan indikator melayang *"Memproses..."*.
  2. Ambil metadata kelas portal (`classId`).
  3. Tarik data siswa kelas tersebut menggunakan `syncPortalRoster(portal, studentCache, true)`.
  4. Database PostgreSQL RPC `portal_scanner_roster` menjamin isolasi penuh: hanya mengambil siswa aktif dari `student_class_history` yang memiliki `school_id = p_school` dan `class_id = assigned_class_id`. Siswa dari sekolah lain atau kelas lain tidak akan pernah bocor.
  5. Sembunyikan indikator melayang *"Memproses..."*.
  6. Jika dijalankan di browser (`!isInstalled()`), otomatis panggil `promptOrOfferInstall()` untuk memandu pemasangan ke homescreen.
  7. Jika dibuka dari icon launcher (`isInstalled() === true`), aplikasi langsung menuju ke scanner pemindai tanpa popup instalasi lagi.

---

## 3. Hasil Verifikasi & Pengujian
- **Typecheck:** `npm run typecheck:all` lulus 100% pada seluruh 11 aplikasi.
- **Unit Test:** `npm test` lulus 100% (50 test files, 256 unit tests passed).
- **E2E & Offline Sync:** `tooling/test-waste-offline-sync.mjs` lulus 100%:
  - Verifikasi kemunculan modal instalasi saat diakses via browser portal token.
  - Verifikasi penarikan dan caching roster kelas piket.
  - Verifikasi resolusi offline instan (<1ms) saat mati lampu/offline.
  - Verifikasi antrean DurableQueue dan sinkronisasi senyap otomatis saat koneksi kembali.
- **Build Produksi:** `npm run vercel-build` sukses tanpa peringatan atau kendala packaging.
