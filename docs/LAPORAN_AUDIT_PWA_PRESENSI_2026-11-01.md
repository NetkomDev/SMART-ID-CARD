# Audit dan perbaikan PWA Presensi Kehadiran

Tanggal: 1 November 2026. Lingkup: tampilan HP, perilaku absensi offline, jam sekolah, pendaftaran perangkat, API dan Supabase. Rujukan perilaku: `LAPORAN_PERBAIKAN_PWA_KEHADIRAN_2026-10-31.md` dan kebutuhan pemindaian guru piket/satpam.

**Pembaruan lanjutan:** tombol ekspor antrean kemudian dihapus atas permintaan pengguna. Audit terbaru dan mekanisme sinkronisasi otomatis dijelaskan dalam `LAPORAN_QR_BERSAMA_DAN_SINKRONISASI_PIKET_2026-11-01.md`.

## Temuan dan perbaikan

| Temuan | Perbaikan |
|---|---|
| Kartu sekolah pada tangkapan layar mempunyai ruang kosong vertikal yang besar. Aturan flex lama menetapkan basis tinggi 160px pada nama sekolah setelah susunan diubah menjadi kolom. | Basis tersebut dihapus. Nama sekolah, identitas petugas, status jaringan, keterangan data offline dan tombol pembaruan ditata ulang dalam satu kartu ringkas. Tombol identitas dan pembaruan mempunyai area sentuh minimal 44px. |
| Hari Minggu dan kedatangan sebelum jam mulai diblokir tanpa pengaturan kalender sekolah; laporan sebelumnya menyatakan kedatangan lebih awal tetap dicatat. | Pemindaian tidak lagi diblokir berdasarkan asumsi tersebut. Jam akhir tetap menentukan terlambat dan jam pulang tetap menentukan pulang cepat. Hari libur nasional/sekolah belum dikonfigurasi sehingga tidak ditebak oleh aplikasi. |
| Mode otomatis berpindah ke pulang pada titik tengah antara jam datang dan jam pulang; siswa yang datang terlambat bisa salah dicatat sebagai pulang. | Mode otomatis berpindah pada jam pulang resmi. Petugas tetap dapat memilih mode pulang lebih awal, mengisi alasan, dan mencatatnya. Pilihan manual direset saat tanggal sekolah berubah. |
| Perubahan nama petugas mencoba mendaftarkan HP sekali; kegagalan jaringan hanya dicatat di konsol, meski pesan menyebut akan mencoba lagi. | Pendaftaran perangkat dicoba lagi di latar belakang saat koneksi pulih dan secara berkala saat portal aktif. Antrean transaksi tetap terpisah dari pendaftaran perangkat. Permintaan jaringan dibatasi 15 detik agar kegagalan koneksi tidak mengunci proses sinkronisasi selamanya. |
| Fungsi bind perangkat baru tidak memeriksa peran portal dan dapat memperbarui ID perangkat dari sekolah lain atau perangkat fisik bila ID diketahui. | Migrasi `202611010009_attendance_device_scope.sql` hanya menerima portal GATE_STAFF aktif, menolak perangkat sekolah lain dan perangkat fisik, serta memakai kode perangkat dengan UUID lengkap. ID HP baru dipisahkan per sekolah dan akses portal; event yang sudah berada dalam antrean mempertahankan ID aslinya. |
| Dua overload provisioning QR sama-sama dapat dipanggil dengan tujuh parameter karena overload delapan parameter mempunyai default. | Default pada overload delapan parameter dihapus, dengan wrapper tujuh parameter tetap tersedia. Hak provisioning tetap khusus service role. Keduanya diuji bersama portal sebelumnya. |
| Fungsi UUID browser baru tidak tersedia di sebagian HP lama. | UUID tetap menggunakan sumber acak browser yang aman melalui `getRandomValues` bila `crypto.randomUUID` tidak tersedia. |
| Tombol pembaruan data yang disebut laporan sebelumnya hilang setelah perubahan layout. | Tombol pembaruan data dikembalikan, dengan status keberhasilan berdasarkan snapshot yang benar-benar diperbarui. |

Kamera melepaskan stream saat halaman disembunyikan. Ketika akses petugas dicabut, scanner dikunci dan antrean tetap disimpan. Sinkronisasi memakai UUID yang sama saat retry dan tidak menghapus item yang belum diakui server. Dua HP yang offline baru dapat saling dideduplikasi setelah sinkronisasi; catatan dengan waktu pemindaian paling awal menjadi resmi. QR statis tetap memerlukan pengawasan petugas untuk mencocokkan siswa dengan kartu.

## Verifikasi

- Basis data PostgreSQL lokal: migrasi dari awal, portal QR, integrasi orang tua, kehadiran, batas hak bind perangkat, serta 10 sesi bersamaan yang menghasilkan satu kehadiran resmi 07.30 dari 10 kejadian audit.
- Supabase produksi: migrasi diuji dalam transaksi rollback sebelum dan sesudah penerapan. Percobaan bind perangkat fisik, lintas sekolah, portal lain dan anonim ditolak. Fixture uji tidak dipertahankan.
- Migrasi 007 dan 008 sebelumnya sudah ada di database tetapi belum ada dalam riwayat migrasi. Isi fungsi, kolom dan batas hak dibandingkan dengan sumber; setelah cocok, riwayatnya dicatat bersama penerapan migrasi 009 agar deployment database berikutnya tidak mengulang fungsi lama.
- Pengujian browser memakai production build, ukuran HP/tablet dan kamera virtual. Bukti ada di `docs/analysis/2026-11-01/attendance-audit/`.
- Waktu database/HTTP, emulator, dan produksi tidak menggantikan uji lapangan pada HP fisik, kamera nyata, serta jaringan sekolah.

## Operasional offline

Data siswa dan jam sekolah harus diunduh saat terhubung; snapshot berlaku tujuh hari. Pengiriman otomatis berjalan ketika PWA aktif atau dibuka kembali; sistem operasi dapat menangguhkan PWA yang sudah ditutup. Siswa yang baru ditambahkan harus muncul di snapshot HP sebelum kartu dapat dikenali offline. Waktu HP dikalibrasi saat terhubung, dan waktu yang di luar batas server dipertahankan untuk pemeriksaan admin.

## Deployment

Deployment **dpl_6bj2B8BVMUTbmfnTiTcDgakRcEGL** berstatus READY pada 1 November 2026 pukul 01.52.45 WITA. Alias `www.aksis.co.id` telah diperiksa menunjuk ke deployment ini. Portal: `https://www.aksis.co.id/attendance/`. Sepuluh pintu aplikasi, autentikasi endpoint, aset offline, dan service worker diperiksa pada domain produksi. Pengujian browser pada produksi memakai fixture API dan kamera virtual, tanpa mengubah transaksi siswa sekolah. Bukti tersimpan pada direktori audit.
