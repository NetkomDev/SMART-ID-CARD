# Laporan Optimasi Portal Orang Tua Siswa (PWA) - 2026-11-03

## 1. Ringkasan Eksekutif
Telah dilakukan audit menyeluruh dan perbaikan pada **Portal Orang Tua Siswa** (`apps/parent-pwa`) dengan berfokus pada 3 pilar:
1. **Waktu Peluncuran Aplikasi (Cold Start Time & Zero-Flicker)**
2. **Estetika & Responsivitas Tampilan UI Mobile**
3. **Sinkronisasi Database Non-Blocking di Latar Belakang & Ketahanan Mode Offline**

Semua perbaikan telah divalidasi dengan `npm run typecheck:all`, `npm test` (50 test files / 256 unit tests lulus 100%), dan `npm run vercel-build`.

---

## 2. Rincian Temuan & Solusi yang Diterapkan

### A. Waktu Peluncuran (0ms Instant Cold Start & No Login Flicker)
- **Sebelumnya**: Fungsi inisialisasi langsung memanggil `loginView("Memeriksa sesi…")` secara sinkron, merusak tampilan splash loader pembuka (`.aksis-initial-loader`) dan memunculkan form login kosong selama 0.5 - 2 detik sebelum masuk ke dashboard.
- **Perbaikan**:
  - Diimplementasikan layer cache persisten `ParentOfflineSnapshot` (`aksis_parent_snapshot_v4`) pada `localStorage`.
  - Jika snapshot data anak tersedia, dashboard langsung dirender dalam **0ms** begitu aplikasi terbuka tanpa kedipan form login.
  - Pengecekan sesi server (`portal.start()`) dan penarikan data terbaru berjalan di latar belakang secara hening.

### B. Sinkronisasi Database Non-Blocking di Latar Belakang
- **Sebelumnya**: Saat mengambil data anak, aplikasi menampilkan `#loading-overlay` ("Memproses...") dengan backdrop gelap dan blur (`z-index: 999999`) yang membekukan seluruh layar dan mengunci sentuhan pengguna.
- **Perbaikan**:
  - Dihapus seluruh pemanggilan `showLoadingOverlay` pada siklus sinkronisasi data reguler.
  - Diaktifkan `#sync-bar` (indikator progress bar halus 3px dengan animasi gradien warna) di bagian atas header. Pengguna tetap bebas menjelajah, melihat riwayat pinjaman buku, jadwal ekskul, atau berpindah anak tanpa hambatan atau freeze.

### C. Ketahanan Mode Offline (Offline Resilience)
- **Sebelumnya**: Jika perangkat pengguna kehilangan koneksi internet atau dalam mode pesawat saat aplikasi dibuka, pemanggilan `portal.start()` gagal dan melempar pengguna ke form login dengan pesan "Belum dapat terhubung".
- **Perbaikan**:
  - Apabila jaringan offline, aplikasi tetap menampilkan data aktivitas terakhir dari snapshot offline secara read-only.
  - Ditambahkan banner status elegan di bagian atas layar: `"📡 Mode Offline · Menampilkan data tersimpan di HP"`.
  - Dilengkapi event listener `window.addEventListener("online")` dan `window.addEventListener("offline")` untuk mendeteksi status konektivitas secara otomatis dan langsung melakukan sinkronisasi otomatis ketika koneksi kembali normal.
  - Pembersihan snapshot lokal diatur hanya berjalan saat pengguna secara eksplisit menekan tombol **"Keluar"** (`logout`).

---

## 3. Hasil Pengujian & Verifikasi
- **Compiler**: `npm run typecheck:all` -> 11 aplikasi sukses tanpa error TypeScript.
- **Unit Test**: `npm test` -> 50 file pengujian (256 pengujian) lulus 100%.
- **Build Produksi**: `npm run build:parent` -> Selesai dalam 1.06 detik.
- **Monorepo Packaging**: `npm run vercel-build` -> Berhasil mengemas 10 frontend portal dan API backend.
