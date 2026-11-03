# Laporan Optimasi Portal Piket Kehadiran Gerbang (PWA) - 2026-11-03

## 1. Ringkasan Eksekutif
Telah dilakukan audit menyeluruh dan perbaikan pada **Portal Piket Kehadiran Gerbang (PWA)** (`apps/attendance-pwa`) dengan berfokus pada 3 pilar utama:
1. **Waktu Peluncuran Aplikasi (Cold Start Time, 0ms Kiosk Readiness & Eliminasi Blank Screen)**
2. **Estetika & Kenyamanan Visual Antarmuka (Ambient Splash Loader, Top Sync Progress Bar, & Status Offline)**
3. **Sinkronisasi Database Non-Blocking di Latar Belakang & Ketahanan Mode Offline di Pintu Gerbang Sekolah**

Semua perbaikan telah divalidasi dengan `npm run build:attendance`, `npm run typecheck:all`, `npm test`, dan `npm run vercel-build`.

---

## 2. Rincian Temuan & Solusi yang Diterapkan

### A. Waktu Peluncuran (0ms Instant Cold Start & Splash Loader)
- **Sebelumnya**:
  - `index.html` tidak memiliki splash loader inline; saat guru piket membuka aplikasi di pintu gerbang sekolah saat pagi hari, layar putih (*blank screen*) sempat muncul sebelum script diunduh dan diparsing browser.
  - Pada pembukaan awal jika snapshot belum ada atau perlu diperbarui, aplikasi menampilkan `showLoadingOverlay(true, "Memproses...")` berupa modal toast hitam gelap yang membekukan interaksi kamera dan scanner.
- **Perbaikan**:
  - Ditambahkan splash loader inline elegan di `index.html` (`.aksis-initial-loader`) bertema *Deep Emerald Green* (`#064e3b`).
  - Dihapus penggunaan modal pemblokir `showLoadingOverlay` pada startup. Aplikasi memanfaatkan snapshot IndexedDB lokal untuk membuka layar scanner gerbang seketika dalam **0ms**. Pengambilan data awal dialihkan ke indikator progres sinkronisasi latar belakang (`#sync-bar`).

### B. Sinkronisasi Database Non-Blocking di Latar Belakang
- **Sebelumnya**:
  - Sinkronisasi antrean kehadiran gerbang (`sync()`), bootstrap data siswa (`refreshData()`), dan sinkronisasi jam aturan sekolah (`refreshState()`) berjalan di latar belakang tanpa indikator visual yang jelas, atau membingungkan petugas apakah pemindaian kartu terkirim atau belum.
- **Perbaikan**:
  - Ditambahkan bilah progres sinkronisasi tipis 3px (`#sync-bar`) di bagian atas aplikasi dengan gradien hijau toska aktif.
  - Setiap kali siklus `sync()`, `refreshData()`, atau `refreshState()` aktif, bar bergerak secara dinamis tanpa mengunci viewfinder kamera pemindai kartu siswa.

### C. Ketahanan Mode Offline di Pintu Gerbang (Offline Gate Attendance Resilience)
- **Sebelumnya**:
  - Saat sinyal seluler di gerbang sekolah melemah, guru piket tidak mengetahui apakah status presensi yang baru saja dipindai tersimpan offline di ponsel atau gagal.
- **Perbaikan**:
  - Ditambahkan status banner offline interaktif (`#offline-badge` / `.offline-badge-bar`): `"📡 Mode Offline · Kehadiran gerbang tersimpan di HP dan menunggu sinkronisasi"`.
  - Terintegrasi penuh dengan event listener `window.addEventListener("online")` dan `window.addEventListener("offline")`. Saat online kembali, banner otomatis disembunyikan dan antrean lokal langsung disinkronkan secara mulus ke server.

### D. Penyeragaman Warna Latar Splash Screen PWA & Analisis Akar Masalah (Root Cause)
- **Analisis Komparatif PWA Portal Lainnya**:
  - `apps/parent-pwa`: `background_color: "#edf7f2"`, `theme_color: "#164736"`, manifest link menggunakan path absolut `/manifest.webmanifest`.
  - `apps/waste-pwa`: `background_color: "#eff8f2"`, `theme_color: "#075b3d"`, icon paths `/icon-192.png`.
  - `apps/extracurricular-pwa`: `background_color: "#eff8f3"`, `theme_color: "#07563f"`, icon paths `/icon-192.png`.
  - `apps/library-terminal`: `background_color: "#eff8f3"`, `theme_color: "#07563f"`, icon paths `/icon-192.png`.
  - Semua portal lainnya menggunakan warna latar sangat terang / putih keabuan dengan ikon berlatar putih bersih.

- **Mengapa PWA Presensi Sebelumnya Masih Berwarna Hijau Tua? (3 Akar Masalah Utama)**:
  1. **Service Worker Version Cache-Lock**:
     Di `apps/attendance-pwa/vite.config.ts`, variabel `VERSION` pada `sw.js` digenerate hanya berdasarkan nama-nama aset (`assets.join("|")`) dan isi file `sw.js` mentah. Ketika `manifest.webmanifest` di folder `public` atau `index.html` diedit, daftar nama aset tidak berubah, sehingga `VERSION` tetap terkunci di `'2123bdef7652ba50'`. Akibatnya, browser tidak mendeteksi adanya file `sw.js` baru dan terus melayani salinan lama `manifest.webmanifest` dari Cache Storage (yang masih berisi `background_color: "#064e3b"`).
  2. **Link Manifest Relatif Tanpa Leading Slash**:
     Di `apps/attendance-pwa/index.html`, tag manifest ditulis `<link rel="manifest" href="manifest.webmanifest">` (relatif), bukan `/manifest.webmanifest`. Akibatnya Vite tidak melakukan path rewrite ke base path `/attendance/manifest.webmanifest` secara konsisten saat packaging.
  3. **Vercel Routing Fallback**:
     Navigasi ke `https://www.aksis.co.id/attendance` (tanpa garis miring penutup) sebelumnya tidak memiliki aturan rute spesifik di `vercel.json`, sehingga jatuh ke fallback `/(.*) -> /index.html` (portal Admin Web), yang memuat manifest root `/manifest.webmanifest` (yang memiliki konfigurasi warna berbeda).

- **Perbaikan Multi-Layer yang Diterapkan**:
  1. **Manifest Web**: Mengubah `background_color` menjadi `"#ffffff"`, menambahkan `"id": "./"`, `"lang": "id"`, dan memastikan seluruh link icon menggunakan path absolut (`/icon-192.png`, `/icon-512.png`, `/maskable-icon-512.png`).
  2. **Index HTML & Inline Loader**: Mengubah `<link rel="manifest" href="/manifest.webmanifest">` dan favicon/apple-touch-icon agar Vite me-rewrite secara tepat ke `/attendance/manifest.webmanifest`. Menyetel background inline loader dan body ke `#ffffff`.
  3. **CSS Body Pseudo-Element**: Menambahkan `body::before { display: none; }` di `src/style.css` untuk menonaktifkan gradien hijau tua 280px warisan dari `portal-theme.css`.
  4. **Dynamic Hash Buster pada SW**: Memperbarui algoritma hashing di `vite.config.ts` agar menyertakan isi konten `public/manifest.webmanifest` dan `index.html`. Ini berhasil memicu rotasi hash versi service worker baru (`d4174f8c9be6356e`), memaksa seluruh browser dan PWA terpasang untuk memperbarui cache.
  5. **Auto Service Worker Update**: Memperbarui `apps/shared/install-prompt.ts` agar setelah registrasi service worker, memanggil `reg.update()` secara otomatis untuk memeriksa perubahan service worker di server.
  6. **Routing Vercel**: Menambahkan rute eksplisit untuk `/attendance`, `/parent`, `/waste`, `/extracurricular`, `/library`, dan `/led` di `vercel.json` agar direktori PWA langsung dilayani tanpa trailing-slash redirect.

---

## 3. Hasil Pengujian & Verifikasi
- **Compiler**: `npm run typecheck:all` -> Seluruh aplikasi monorepo lulus tanpa error TypeScript.
- **Unit Test**: `npm test` -> 50 file pengujian (256 pengujian) lulus 100%.
- **Build Produksi**: `npm run build:attendance` -> Selesai dan teroptimasi, SW `VERSION = 'd4174f8c9be6356e'`.
- **Monorepo Packaging**: `npm run vercel-build` -> Berhasil mengemas semua frontend portal dan backend API.
- **EGM Contract**: Telah diperbarui di `apps/attendance-pwa/README.md`.

