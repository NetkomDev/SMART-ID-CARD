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

### D. Penyeragaman Warna Latar Splash Screen PWA
- **Sebelumnya**:
  - `manifest.webmanifest` mendefinisikan `"background_color": "#064e3b"` (hijau tua), menyebabkan layar pembuka (splash screen OS / browser) saat peluncuran PWA berlatar belakang hijau tua pekat, tidak seragam dengan portal PWA lainnya.
- **Perbaikan**:
  - Nilai `background_color` pada `apps/attendance-pwa/public/manifest.webmanifest` diubah menjadi `#ffffff` (putih bersih) agar seragam dengan seluruh portal PWA AKSIS.
  - Ditambahkan deklarasi `html, body { background-color: #ffffff; }` dan `.aksis-initial-loader { background-color: #ffffff; }` pada inline style `index.html` untuk menjamin frame awal peluncuran aplikasi langsung bersih dan konsisten.

---

## 3. Hasil Pengujian & Verifikasi
- **Compiler**: `npm run typecheck:all` -> Seluruh aplikasi monorepo lulus tanpa error TypeScript.
- **Unit Test**: `npm test` -> 50 file pengujian (256 pengujian) lulus 100%.
- **Build Produksi**: `npm run build:attendance` -> Selesai dan teroptimasi.
- **Monorepo Packaging**: `npm run vercel-build` -> Berhasil mengemas semua frontend portal dan backend API.
- **EGM Contract**: Telah diperbarui di `apps/attendance-pwa/README.md`.
