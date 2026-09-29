# AKSIS Kontrol Orang Tua

Portal keluarga dengan profil siswa, kehadiran, poin Bank Sampah, kunjungan perpustakaan, dan jadwal/status ekstrakurikuler. Tema hijau dan mint mengikuti portal Bank Sampah dengan susunan kartu dari referensi desain orang tua.

Jalankan `npm run dev:parent`; build produksi: `npm run build:parent`.

## Data dan akses

- QR sekolah membuka sesi; orang tua menghubungkan anak menggunakan NISN/nomor siswa dan tanggal lahir. Hubungan anak dibatasi oleh `auth.uid()` serta `session_id`.
- RPC `get_parent_child_today` menyediakan ringkasan dan waktu pembaruan. Hari/bulan serta format jam memakai zona waktu sekolah.
- Poin berasal dari `waste_transactions.points_earned`. Setoran tanpa nilai poin diberi keterangan; UI tidak mengasumsikan konversi berat ke poin.
- Jadwal ekskul berasal dari sesi hari ini, mengecualikan kegiatan dibatalkan dan keanggotaan tidak aktif. Status hadir, izin, tidak hadir, dan belum presensi berbeda. Detail menampilkan semua sesi hari ini.
- `students.photo_url` bersifat opsional. Tanpa foto atau jika foto gagal dimuat, avatar memakai inisial siswa.
- API lama yang hanya memberikan timeline menampilkan `—` untuk total poin dan kunjungan bulanan yang tidak tersedia.
- Tombol **Perbarui data** mengambil ulang ringkasan. Tombol pada kartu membuka detail kategori dalam dialog dengan dukungan keyboard.
- Service worker hanya menyimpan aset/shell portal, tidak menyimpan respons API atau data anak.

## Migrasi dan pengujian

Migrasi baru: `supabase/migrations/202609300001_parent_dashboard.sql`. Memerlukan migrasi sebelumnya, termasuk isolasi sesi orang tua dan kolom poin Bank Sampah. Menambahkan kolom foto nullable dan mengganti RPC ringkasan; tidak menghapus data atau mengubah portal lain.

```sh
npx tsc -p apps/parent-pwa/tsconfig.json --noEmit
npm run build:parent
node tooling/test-parent-pwa.mjs
bash tooling/test-parent-db-local.sh
```

Tes browser memakai API fixture, bukan data siswa produksi; memerlukan portal lokal di port 4174 dan Chrome/Puppeteer. Tes database membuat PostgreSQL sementara, menerapkan seluruh migrasi, memeriksa waktu lokal, data kosong, poin asli, status ekskul, isolasi sesi/sekolah, siswa nonaktif, serta QR dicabut; instance sementara dihapus setelah selesai.

## Status penerapan 30 September 2026

Migrasi dashboard `202609300001` serta dependensi `202609280026`, `202609290001`, dan `202609290002` telah diterapkan secara atomik pada proyek Supabase `mzurocuwgoqwooilxuvv` dan dicatat dalam riwayat migrasi. Verifikasi RPC proyek asli lulus untuk struktur ringkasan dan isolasi sesi; tautan uji di-rollback. Migrasi lain di workspace tidak ikut diterapkan.

UI telah dibangun dan diuji secara lokal; publikasi frontend produksi terpisah dari migrasi database ini.
