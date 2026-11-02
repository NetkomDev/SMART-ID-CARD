# AKSIS Kontrol Orang Tua

## Overview
Portal keluarga dengan profil siswa, kehadiran, poin Bank Sampah, kunjungan perpustakaan, dan jadwal/status ekstrakurikuler. Tema hijau dan mint mengikuti portal Bank Sampah dengan susunan kartu dari referensi desain orang tua.

Jalankan `npm run dev:parent`; build produksi: `npm run build:parent`.

## Interface
- `Child`: Model data anak tertaut (`student_id`, `school_name`, `full_name`, `student_number`, `class_name`, `relationship`, `photo_url`).
- `ParentTodayData`: Ringkasan aktivitas hari ini (`profile`, `attendance`, `waste`, `library`, `extracurricular`, `events`).
- `ParentSession`: Pengelola sesi orang tua dengan token isolasi.
- `QRCamera`: Pindai QR tautan akses awal.
- `showLoadingOverlay`: Indikator toast melayang *"Memproses..."* saat data anak disiapkan.

## Invariants
- QR sekolah membuka sesi; orang tua menghubungkan anak menggunakan NISN/nomor siswa dan tanggal lahir. Hubungan anak dibatasi oleh `auth.uid()` serta `session_id`.
- RPC `get_parent_child_today` menyediakan ringkasan dan waktu pembaruan. Hari/bulan serta format jam memakai zona waktu sekolah.
- Poin berasal dari `waste_transactions.points_earned`. Setoran tanpa nilai poin diberi keterangan; UI tidak mengasumsikan konversi berat ke poin.
- Jadwal ekskul berasal dari sesi hari ini, mengecualikan kegiatan dibatalkan dan keanggotaan tidak aktif. Status hadir, izin, tidak hadir, dan belum presensi berbeda. Detail menampilkan semua sesi hari ini.
- `students.photo_url` bersifat opsional. Tanpa foto atau jika foto gagal dimuat, avatar memakai inisial siswa.
- API lama yang hanya memberikan timeline menampilkan `—` untuk total poin dan kunjungan bulanan yang tidak tersedia.
- Service worker hanya menyimpan aset/shell portal, tidak menyimpan respons API atau data anak.
- Popup instalasi PWA langsung muncul hampir bersamaan saat tampil di browser (`!isInstalled()`), dan tidak muncul lagi bila dibuka dari ikon launcher di HP.

## Side Effects
- Menyimpan cache profil dan data harian anak di browser `localStorage`.
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

