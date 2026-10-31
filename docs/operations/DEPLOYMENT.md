# Deployment setelah perbaikan

Preferensi pemilik sejak 31 Oktober 2026: setiap perbaikan yang selesai dan lolos pemeriksaan dilanjutkan ke deployment Vercel, lalu diverifikasi pada produksi.

## Target

- Proyek: `aksis` (`prj_U0BZHcfjY9qJMSuvUiY2SAdZXEfr`).
- Organisasi: `netkom-developers-projects`.
- Domain utama: `https://www.aksis.co.id`.
- Pemetaan lokal: `.vercel/repo.json`.

## Urutan

1. Periksa perubahan lokal; pertahankan perubahan pemilik yang tidak terkait.
2. Jalankan `npm run verify` dan tes browser/domain yang relevan. Perubahan database memerlukan pemeriksaan migrasi tersendiri; deployment frontend/API tidak otomatis menerapkan SQL.
3. Periksa manifest upload dengan `vercel deploy --dry --prod --project prj_U0BZHcfjY9qJMSuvUiY2SAdZXEfr --scope netkom-developers-projects --json`. `.vercelignore` mengecualikan `.env`, dokumen, hasil pengujian, build lokal, dan folder editor.
4. Deploy sumber lokal yang sudah diverifikasi:

   ```sh
   vercel deploy --prod --project prj_U0BZHcfjY9qJMSuvUiY2SAdZXEfr --scope netkom-developers-projects --yes
   ```

5. Tunggu status `READY`; pastikan domain menunjuk deployment baru.
6. Periksa halaman utama, portal terkait, aset JS/CSS terbaru, `/api/v1/health`, serta respons penolakan autentikasi untuk endpoint yang dilindungi. Jangan membuat transaksi bisnis untuk smoke test.
7. Catat deployment ID, URL, waktu WITA, hasil verifikasi dan batas pengujian. Jika endpoint inti gagal sesudah perubahan, pulihkan deployment produksi sebelumnya dan perbaiki penyebabnya sebelum mencoba kembali.

CLI dapat memakai autentikasi Vercel yang sudah tersedia pada mesin. Jangan menyalin token ke source, log atau laporan. Nilai environment sensitif tetap dikelola di Vercel; hasil `env pull` yang berisi placeholder `[SENSITIVE]` tidak boleh diunggah kembali sebagai nilai konfigurasi.

Deployment CLI dapat menggunakan perubahan lokal yang belum dikomit. Catat hal itu bila relevan; keberhasilan deployment tidak berarti perubahan sudah di-push ke GitHub. Perubahan konfigurasi produksi atau migrasi SQL harus dinyatakan secara terpisah.
