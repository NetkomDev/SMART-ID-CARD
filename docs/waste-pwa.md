# PWA Bank Sampah

PWA `/waste/` tetap menggunakan QR akses `WASTE_STAFF` yang ditetapkan admin sekolah ke satu kelas. Pemindaian dan input hanya dapat dilakukan untuk siswa aktif pada kelas tersebut. Identitas petugas berasal dari sesi QR; bukan nama yang diketik bebas.

## Tampilan dan klasemen

- Tampilan Piket Sampah mengikuti referensi: hijau, kamera, identitas siswa, organik/anorganik, berat, poin, simpan, ringkasan hari ini.
- `Lihat Klasemen` membuka kelas berdasarkan total kg, maksimal 3 siswa dengan setoran tertinggi, dan maksimal 3 siswa dengan setoran terendah.
- Periode: hari ini, bulan ini (awal), dan semua waktu, berdasarkan zona waktu sekolah. Ringkasan hari ini selalu untuk seluruh sekolah.
- Siswa aktif dengan kelas aktif dan belum menyetor masuk kelompok terendah dengan 0 kg. Peringkat tertinggi hanya memuat siswa dengan setoran positif. Jika peserta kurang dari 3, jumlah yang tersedia ditampilkan; dua daftar bisa beririsan.
- Berat sama diurutkan berdasarkan nama lalu ID agar hasil stabil. Kelas ditentukan berdasarkan kelas transaksi saat menyetor; label kelas siswa menggunakan kelas aktif saat ini. Kelas nonaktif/dihapus tidak tampil pada klasemen.
- Layar penuh, tata letak responsif, dan pembaruan otomatis setiap 60 detik tersedia tanpa perangkat LED. Pembaruan berhenti saat aplikasi tidak terlihat. Jika pembaruan gagal, aplikasi memberi tahu dan tidak menganggap data kosong sebagai nol.

## Poin dan integritas

Admin sekolah mengisi tarif organik/anorganik melalui Bank Sampah → Jadwal Operasional. Nilai kosong berarti belum menggunakan poin. Tarif awal sengaja tidak diasumsikan dari gambar contoh. Poin dibulatkan dua desimal, dihitung oleh database, dan disimpan per transaksi; perubahan tarif tidak mengubah poin historis. Transaksi lama tetap memiliki poin NULL, tanpa backfill fiktif.

Setiap setoran menggunakan `event_id` yang sama saat diulang. Input dikunci selama hasil penyimpanan belum pasti; snapshot disimpan dalam sessionStorage per akses portal untuk melanjutkan setelah reload pada tab yang sama. Penyimpanan sukses menghapus snapshot. Snapshot tidak menyediakan antrean setoran offline. Database juga memeriksa keanggotaan kelas dan jam operasional, termasuk jadwal yang melewati tengah malam.

## Database dan penerapan

Terapkan `supabase/migrations/202609280026_waste_pwa_dashboard.sql` sebelum menerbitkan API dan PWA baru. Migrasi menambahkan tarif nullable, poin transaksi, indeks, trigger, dan RPC `waste_dashboard(uuid,text)`; tidak menghapus transaksi lama.

Untuk database lama yang belum memiliki RPC tersebut, API memakai pembaca kompatibilitas
`apps/api/src/services/waste-dashboard.ts` hanya saat Supabase mengembalikan `PGRST202`.
Pembaca memeriksa sesi, izin `waste.read`, dan konteks QR, lalu menggunakan service-role
di server untuk agregasi seluruh kelas dalam sekolah yang telah diotorisasi. Setiap
query data difilter dengan ID sekolah dari middleware, dipaginasi, dan respons hanya
berisi ringkasan serta nama/berat klasemen. Kredensial dan baris mentah tidak dikirim ke PWA.
Periode mengikuti zona waktu sekolah; tarif/poin yang belum tersedia tetap nullable,
tanpa menghitung ulang atau mengarang poin historis. Jalur ini hanya membaca data dan
tidak menggantikan migrasi untuk fitur penyimpanan poin atau tarif baru.

RPC hanya mengungkap agregat dan nama peserta klasemen dalam satu sekolah kepada akun dengan `waste.read`, dengan pemeriksaan sesi QR aktif dan sekolah/jenis portal. Akses anonim, QR dicabut, portal lain, dan sekolah lain ditolak. RLS transaksi dan data mentah siswa tetap terbatas kelas. Agregasi dilakukan di PostgreSQL sehingga tidak terpotong batas jumlah baris PostgREST.

Endpoint baru: `GET /api/v1/waste/dashboard?period=today|month|all`. Response tidak di-cache. Pengaturan tarif ditambahkan ke `GET/PATCH /api/v1/schools/current`, dengan PATCH khusus admin dan validasi nilai.

## Verifikasi

- `npm run typecheck:portals`
- `npm test`
- `npm run build:waste` dan `npm run build:admin`
- `DATABASE_URL=<database-lokal-sementara> npm run test:db:waste`
- Jalankan `npm run dev:waste`, lalu `AKSIS_PUPPETEER_MODULE=<lokasi-puppeteer> npm run test:browser:waste` (Chrome lokal; API memakai fixture).

Tes database memakai transaksi yang di-rollback: lintas sekolah/kelas, >1.000 setoran, siswa tanpa setoran, periode, snapshot poin, QR dicabut, dan anonim. Tes browser memeriksa QR gate, input, poin, respons hilang, klik ganda, pemulihan reload, klasemen, periode gagal/kosong, layar penuh, dan responsivitas. Kamera fisik dan izin kamera perlu diperiksa pada ponsel HTTPS.

## Penyegaran tampilan 29 September 2026

PWA mengikuti referensi mint–hijau dengan bingkai pemindai, identitas terverifikasi, pilihan jenis sampah dan kartu ringkasan. Halaman Lihat Klasemen menyatukan grafik donat kontribusi kelas aktif, total berat sesuai periode, jumlah kelas yang berkontribusi, serta grafik batang kelas dan tiga siswa tertinggi/terendah. Total grafik merupakan penjumlahan kelas aktif yang ditampilkan, bukan total historis kelas yang sudah nonaktif. Grafik siswa menggunakan skala bersama dan 0 kg tetap berupa batang kosong. Nilai angka dan nama tetap terbaca tanpa mengandalkan warna; animasi pemindai mengikuti prefers-reduced-motion.
