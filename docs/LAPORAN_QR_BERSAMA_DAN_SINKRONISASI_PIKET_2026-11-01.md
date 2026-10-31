# Audit QR bersama dan sinkronisasi PWA Piket Kehadiran

Tanggal: 1 November 2026. Lingkup: satu QR akses Piket Kehadiran pada beberapa HP, pencatatan bersamaan, antrean offline, dan sinkronisasi otomatis.

## Hasil investigasi

1. QR Piket yang masih aktif dapat dipakai berulang kali. Endpoint `/auth/qr/login` memeriksa hash, peran, masa berlaku dan pencabutan; endpoint tersebut tidak menandai QR sebagai sekali pakai. Login memakai akun portal sekolah yang sama, tetapi masing-masing HP menyimpan sesi dan refresh token sendiri.
2. Pada Supabase produksi diuji 10 login paralel terhadap satu akun Auth uji terpisah: 10 refresh token berbeda, seluruh sesi berhasil diperbarui dan tetap valid. Akun uji dihapus setelah pengujian. Tidak ada data siswa atau transaksi sekolah yang dibuat. Ini menguji mekanisme sesi Auth yang digunakan QR; pengujian ini bukan pemindaian QR fisik pada 10 HP.
3. Setiap HP menyimpan UUID perangkat, nama petugas dan antrean per sekolah/portal. Karena QR bersama memakai akun portal yang sama, nama petugas adalah identitas yang diisi pada HP, bukan identitas individual yang diverifikasi dengan akun masing-masing.
4. Di PostgreSQL lokal, 10 sesi melakukan sinkronisasi bersamaan untuk siswa dan hari yang sama. Seluruh 10 event disimpan pada ledger; hanya satu baris kehadiran resmi, dengan waktu paling awal 07.30. Uji terpisah membuktikan scan 07.30 yang disinkronkan setelah scan 07.35 menggantikan waktu 07.35. Batas kedatangan/pulang dan waktu mengikuti zona sekolah.
5. Duplikat pada HP yang sama dapat diberitahukan langsung. Dua HP yang keduanya offline tidak dapat mengetahui hasil satu sama lain sampai sinkronisasi; keputusan resmi lintas HP ditetapkan di database, termasuk ketika data yang lebih awal masuk belakangan. Keakuratan urutan bergantung pada ketepatan waktu perangkat saat offline.
6. Admin yang membuat QR pengganti mencabut QR lama. Karena antrean dipisahkan berdasarkan sekolah dan portal, antrean lama tetap berada di HP dan tidak otomatis dipindahkan ke akses baru. Pastikan antrean tersinkron sebelum QR diganti; bila akses sudah dicabut sementara ada antrean lama, hubungi pengelola untuk penanganan data. Data tidak otomatis dihapus atau dikirim ke sekolah lain.

## Perubahan

- Tombol **Ekspor antrean untuk pemeriksaan admin** dan aksi pengunduhan berkas dihapus dari portal.
- Pengiriman ke database berjalan otomatis di latar belakang setiap sekitar 8,5 detik saat PWA aktif dan koneksi tersedia, juga dicoba setelah pemindaian, ketika koneksi kembali, dan ketika aplikasi kembali terlihat. Satu batch memuat maksimal 25 event dan tidak menampilkan loading yang menghalangi pemindaian.
- Setiap event memakai UUID tetap. Hanya event yang memperoleh hasil server diperbarui; event yang baru masuk saat request berjalan serta event yang belum diakui tetap ada untuk percobaan berikutnya. Kesalahan jaringan/timeout tidak menghapus antrean.
- Status antrean dan masalah tetap terlihat. Event yang memerlukan keterangan atau ditolak server tetap disimpan dan memerlukan pemeriksaan; tidak diberi status berhasil secara diam-diam.
- Antrean dari implementasi lama tanpa identitas sekolah yang dapat dipastikan tetap disimpan secara terpisah. Peringatan meminta bantuan admin dan tidak lagi menjanjikan tombol ekspor.

## Batas operasional

PWA harus diaktifkan pertama kali dengan QR dan mengunduh data sekolah saat online. Browser dan sistem operasi dapat menunda interval ketika aplikasi disembunyikan, layar dikunci, atau aplikasi ditutup; sinkronisasi berlanjut ketika aplikasi aktif kembali dan jaringan tersedia. Jangan menghapus data situs/aplikasi pada HP yang masih memiliki antrean, karena data offline berada di penyimpanan HP tersebut. Pencabutan akses baru diketahui saat HP tersambung kembali.

## Verifikasi

- Sepuluh sesi Auth nyata di proyek Supabase yang terkonfigurasi, dengan akun uji sementara: lulus, akun dibersihkan.
- PostgreSQL 17 sementara: integrasi portal, orang tua dan kehadiran serta 10 koneksi sinkronisasi bersamaan: lulus.
- Pengujian aplikasi: alur pemindaian, antrean, timeout, pengakuan parsial, retry otomatis, mode offline dan tampilan tanpa tombol ekspor, memakai browser dan data API simulasi.
- Pengujian HP fisik dan 10 pemindaian QR nyata secara serentak belum dilakukan; koneksi/lokasi sekolah dapat memengaruhi kecepatan.

Bukti dan identitas deployment disimpan pada `docs/analysis/2026-11-01/attendance-multi/`.

## Deployment

Deployment **dpl_HJDZgLsRvC2kwqKGvHZM7X9AphjB** berstatus READY pada 01 November 2026, 02:05:13 WITA. Alias `www.aksis.co.id` diverifikasi menunjuk ke deployment tersebut. Pemeriksaan produksi lulus untuk sepuluh pintu aplikasi, endpoint dengan autentikasi, aset offline, tidak adanya tombol ekspor, dan alur browser dengan kamera virtual serta API simulasi.
