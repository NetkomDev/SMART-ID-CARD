# Dokumentasi Penerapan Alur Instalasi Cepat & Loading Overlay Seluruh Portal PWA AKSIS

**Tanggal**: 2 November 2026  
**Status**: Terverifikasi dan Siap Deployment  
**Cakupan Aplikasi**:
1. **Portal Piket Bank Sampah** (`apps/waste-pwa`)
2. **Portal Orang Tua Siswa** (`apps/parent-pwa`)
3. **Portal Presensi** (`apps/attendance-pwa`)
4. **Portal Ekstrakurikuler** (`apps/extracurricular-pwa`)
5. **Portal Perpustakaan** (`apps/library-terminal`)

---

## 1. Latar Belakang & Kebutuhan Pengguna
Mengikuti perbaikan yang telah sukses diterapkan pada Portal Piket Bank Sampah, pengguna menginginkan:
1. **Penerapan Alur Instalasi Cepat ke Seluruh PWA**:
   - **Scan QR Portal / Akses di Browser**: Petugas/Siswa/Orang tua membuka tautan portal.
   - **Popup Install Langsung Muncul**: Popup tawaran instalasi PWA muncul seketika hampir bersamaan dengan render pertama browser (`!isInstalled()`), tanpa harus tertunda oleh penarikan data atau pemeriksaan sesi.
   - **Buka dari Ikon Launcher (`isInstalled()`)**: Saat aplikasi dibuka melalui shortcut launcher di layar utama HP (`display-mode: standalone`), aplikasi langsung terbuka penuh tanpa menampilkan popup install lagi.
   - **Penarikan Data Terisolasi & Cepat**: Data ditarik spesifik sesuai portal, sekolah, dan kelas/kegiatan masing-masing tanpa campur aduk antar tenant.
   - **Indikator Melayang *"Memproses..."***: Selama proses penyiapan data awal/sinkronisasi berjalan di latar belakang, indikator toast melayang dengan spinner halus tampil di tengah layar untuk memberikan kejelasan status pada pengguna.

2. **Penyempurnaan Fungsi Pemindaian QR Code di Seluruh PWA**:
   - **Hilangkan Tombol "Aktifkan kamera" di bawah area scan**: Tombol lama dihilangkan untuk merapikan antarmuka dan mencegah kebingungan user.
   - **Ketuk Area Scan untuk Mengaktifkan Kamera**: Cukup dengan mengetuk langsung area viewport/placeholder scan, kamera scanner langsung aktif.
   - **Auto-Center ke Tengah Layar HP**: Saat area scan diklik/ditap, halaman otomatis melakukan smooth scroll membawa area scan tepat ke tengah layar, sehingga user di HP tidak perlu scroll manual lagi.
   - **Auto-Stop Kamera Setelah Scan Membaca QR**: Begitu QR Code berhasil dibaca, kamera otomatis dimatikan seketika agar tidak terus memindai di latar belakang dan user dapat langsung berfokus pada hasil/konfirmasi scan yang tampil.

---

## 2. Rincian Implementasi Teknis

### A. Shared Styles & Layering (`apps/shared/portal-theme.css`)
- Ditambahkan styling class global `.loading-overlay-container`, `.loading-toast-card`, `.toast-spinner` dengan backdrop blur dan animasi pop-in halus.
- Styling dialog `#aksis-install` dipastikan memiliki prioritas z-index tertinggi (`z-index: 10000000 !important;`) sehingga tidak tertutup oleh modal atau status bar apapun.

### B. Shared Install Prompt Logic (`apps/shared/install-prompt.ts`)
- Fungsi `isInstalled()` diekspor untuk memeriksa apakah aplikasi sedang berjalan dalam mode terpasang (`standalone` / fullscreen / window-controls-overlay).
- Fungsi `promptOrOfferInstall()` memicu native install prompt bila didukung atau dialog panduan instalasi visual instan.

### C. Portal Presensi (`apps/attendance-pwa`)
- `index.html`: Ditambahkan kontainer `#loading-overlay`.
- `src/main.ts`:
  - `start()`: Langsung memicu `if (!isInstalled()) void promptOrOfferInstall();` seketika.
  - `refreshState()`: Dibungkus dengan `showLoadingOverlay(true, "Memproses...")` saat memuat status kelas/jadwal dan ditutup di `finally`.
  - Pemanggilan tawaran install yang sebelumnya tertunda di akhir sinkronisasi telah dibersihkan.

### D. Portal Ekstrakurikuler (`apps/extracurricular-pwa`)
- `index.html`: Ditambahkan kontainer `#loading-overlay`.
- `src/main.ts`:
  - `init()`: Langsung memicu `if (!isInstalled()) void promptOrOfferInstall();` seketika.
  - `selectEkskul()`: Menampilkan overlay `"Memproses..."` saat mengunci sesi kegiatan ekskul dan mengambil data roster peserta.

### E. Portal Perpustakaan (`apps/library-terminal`)
- `index.html`: Kontainer `#loading-overlay` telah aktif.
- `src/main.ts`:
  - `start()`: Langsung memicu `if (!isInstalled()) void promptOrOfferInstall();` seketika.
  - `loadDailySummary()` dan sinkronisasi awal dibungkus dengan `showLoadingOverlay(true, "Memproses...")`.
  - Duplikasi fungsi helper lama dibersihkan dan distandarkan.

### F. Portal Orang Tua Siswa (`apps/parent-pwa`)
- `index.html`: Ditambahkan kontainer `#loading-overlay`.
- `src/main.ts`:
  - `start()`: Langsung memicu `if (!isInstalled()) void promptOrOfferInstall();` seketika saat pertama kali dibuka.
  - `fetchDashboardData()`: Menampilkan `showLoadingOverlay(true, "Memproses...")` saat memuat data profil anak pertama kali, dan menutupnya secara otomatis setelah render selesai.

---

## 3. Hasil Pengujian & Verifikasi
- **Typecheck (`npm run typecheck:all`)**: Lulus 100% untuk seluruh 11 aplikasi.
- **Unit Test Suite (`npm test`)**: 50 test files lulus, 256 tests passed tanpa kesalahan.
- **Vercel Build (`npm run vercel-build`)**: Seluruh 10 target frontend ter-bundle dan ter-packaging dengan sukses.
