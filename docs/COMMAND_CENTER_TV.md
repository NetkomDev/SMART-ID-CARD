# Command Center Admin Sekolah — Mode TV dan Tablet

Halaman Ringkasan admin mendukung mode satu layar melalui tombol **Mode Layar TV**. Tombol keluar atau **Esc** mengembalikan navigasi admin. Jika filter sedang terbuka, Esc menutup filter terlebih dahulu. Tab dapat menjangkau seluruh tombol aktif dalam dashboard.

## Tata letak

- Mode TV memakai lima baris grid: identitas/jam, empat metrik, tiga panel utama, pendampingan, dan footer.
- Ukuran viewport diukur lewat `visualViewport` jika tersedia, dengan fallback `innerWidth`/`innerHeight`. Layout mengikuti resize dan perubahan orientasi.
- Tablet landscape mempertahankan tiga pelopor serta tiga baris tiap kategori pendampingan. Baris data tidak disembunyikan lewat media query.
- Tablet portrait memakai panel kehadiran lebar di atas panel sampah dan perpustakaan. Pada lebar 600–700 piksel, kartu metrik disusun dua kolom.
- Ponsel di bawah 600 piksel menggunakan scroll vertikal agar konten tetap terbaca.
- SVG perpustakaan memiliki batas sendiri; nama kelas, jumlah, dan persentase berada pada legenda HTML, sehingga tidak bertumpuk dengan judul.

## Sumber dan arti data

Empat kartu menampilkan persentase siswa hadir, kilogram setoran, jumlah kunjungan perpustakaan, dan presensi ekskul. Denominator siswa mengikuti data API; tidak diganti dengan jumlah siswa contoh.

`GET /api/v1/dashboard/rankings` menyediakan tiga kelas setoran tertinggi, daftar kedatangan awal, seluruh kelas dengan kunjungan tercatat, serta `hourly` untuk kurva kehadiran. Kurva dihitung dari CHECK_IN pertama setiap siswa pada hari sekolah; bukan data contoh. Hari, jam, dan pengecualian event masa depan mengikuti zona sekolah.

Diagram perpustakaan merangkum empat kelas dan kategori lainnya/tanpa kelas bila perlu. Semua segmen ikut denominator. Daftar terendah berlaku untuk **kelas tercatat**, bukan klaim bahwa endpoint telah menyediakan semua kelas tanpa kunjungan. Podium sampah menggunakan tinggi berdasarkan urutan peringkat; angka aktual tetap dicantumkan.

Data kosong ditampilkan sebagai nol atau pesan kosong. Data gagal dimuat tidak diganti dengan data contoh. Snapshot terakhir dapat dipertahankan saat koneksi gagal dengan status terputus/tertunda yang jelas.

**Demo Data** adalah pilihan eksplisit dan ditandai **DATA DEMO**. Data langsung saat ini harian; pilihan minggu/bulan/tahun hanya tersedia dalam demo, sampai backend mendukung filter periode nyata. Keluar dari demo menghapus snapshot demo sebelum mengambil data langsung.

Status perangkat memakai ringkasan seluruh perangkat (`/devices/summary`), dengan heartbeat aktif dua menit terakhir; bukan jumlah online dari lima perangkat sampel.

Pembaruan berjalan setiap 30 detik selama halaman terlihat. Jam diperbarui setiap detik. Penghentian halaman membatalkan permintaan, timer, listener, serta wake lock.

## Fullscreen dan perangkat

Fullscreen API standar dan prefiks WebKit didukung. Jika browser menolak fullscreen native, mode TV tetap memenuhi area viewport halaman; bilah browser tidak dapat disembunyikan oleh CSS. Wake Lock digunakan bila browser menyediakannya.

## Verifikasi

Jalankan `npm run test:browser:command`. Tes memakai Chrome lokal dan API fixture, tanpa akun/data produksi. Lokasi Chrome dapat ditentukan dengan `AKSIS_CHROME`, folder bukti dengan `AKSIS_CC_EVIDENCE`.

Matriks viewport: 800×480, 800×600, 1024×600, 1095×618, 1280×720, 1024×768, 1366×768, 768×1024, 600×960, 1920×1080, dan 2190×1236. Tes memeriksa ukuran layar, overflow panel dan baris pendampingan, batas donut, jumlah baris terlihat, filter, keyboard, data nol, mode demo, gangguan API, fullscreen native, serta fallback tanpa `visualViewport`.

Lihat [laporan perbaikan tablet](LAPORAN_PERBAIKAN_COMMAND_CENTER_TABLET_2026-10-30.md) untuk screenshot dan bukti. Verifikasi memakai emulasi viewport Chrome desktop; tablet fisik dan versi browser perangkat lama tetap perlu diuji langsung. Perubahan ini belum dipublikasikan.
