# AKSIS Kontrol Orang Tua

## Overview
Portal keluarga dengan profil siswa, kehadiran, poin Bank Sampah, kunjungan perpustakaan, dan jadwal/status ekstrakurikuler. Tema hijau dan mint mengikuti portal Bank Sampah dengan susunan kartu dari referensi desain orang tua.

Jalankan `npm run dev:parent`; build produksi: `npm run build:parent`.

## Interface
- `Child`: Model data anak tertaut (`student_id`, `school_name`, `full_name`, `student_number`, `class_name`, `relationship`, `photo_url`).
- `ParentTodayData`: Ringkasan aktivitas hari ini (`profile`, `attendance`, `waste`, `library`, `extracurricular`, `events`).
- `ParentOfflineSnapshot`: Snapshot data persisten `localStorage` (`aksis_parent_snapshot_v4`) menyimpan profil anak, daftar anak, dan ringkasan harian untuk 0ms cold-start.
- `ParentSession`: Pengelola sesi orang tua dengan token isolasi.
- `showSyncBar`: Indikator sinkronisasi data latar belakang non-blocking (progress bar halus 3px) tanpa mengunci UI.
- `showOfflineNotice`: Banner status mode offline ketika koneksi internet terputus tanpa menendang pengguna ke form login.

## Invariants
- Peluncuran aplikasi (Cold Start) me-render dashboard secara instan (0ms) dari snapshot lokal tanpa flicker form login pada pengguna yang sudah terotentikasi.
- Sinkronisasi database berjalan di latar belakang (SWR pattern) tanpa memblokir interaksi sentuhan/klik pengguna (tanpa full-screen blocking overlay).
- Mode offline tetap menampilkan data aktivitas terakhir secara read-only dengan indikator `"Mode Offline"`, dan otomatis sinkronisasi ulang saat jaringan kembali (`online` event listener).
- QR sekolah membuka sesi; orang tua menghubungkan anak menggunakan NISN/nomor siswa dan tanggal lahir. Hubungan anak dibatasi oleh `auth.uid()` serta `session_id`.
- RPC `get_parent_child_today` menyediakan ringkasan dan waktu pembaruan. Hari/bulan serta format jam memakai zona waktu sekolah.
- Poin berasal dari `waste_transactions.points_earned`. Setoran tanpa nilai poin diberi keterangan; UI tidak mengasumsikan konversi berat ke poin.
- Jadwal ekskul berasal dari sesi hari ini, mengecualikan kegiatan dibatalkan dan keanggotaan tidak aktif. Status hadir, izin, tidak hadir, dan belum presensi berbeda. Detail menampilkan semua sesi hari ini.
- `students.photo_url` bersifat opsional. Tanpa foto atau jika foto gagal dimuat, avatar memakai inisial siswa.
- Service worker hanya menyimpan aset/shell portal, tidak menyimpan respons API atau data anak.
- Popup instalasi PWA langsung muncul hampir bersamaan saat tampil di browser (`!isInstalled()`), dan tidak muncul lagi bila dibuka dari ikon launcher di HP.
- Logout pengguna membersihkan snapshot offline persisten dari `localStorage`.

## Side Effects
- Menyimpan cache profil dan data snapshot anak di browser `localStorage` (`aksis_parent_snapshot_v4`).
- Mengirimkan permintaan HTTP ke `/parent/session`, `/parent/children`, dan `/parent/children/:id/today`.

## Verification
- Run: `npm run build:parent && npm test`

### Pengujian Historis & Migrasi
```sh
npx tsc -p apps/parent-pwa/tsconfig.json --noEmit
npm run build:parent
node tooling/test-parent-pwa.mjs
bash tooling/test-parent-db-local.sh
```

Migrasi baru: `supabase/migrations/202609300001_parent_dashboard.sql`. Memerlukan migrasi sebelumnya, termasuk isolasi sesi orang tua dan kolom poin Bank Sampah.

