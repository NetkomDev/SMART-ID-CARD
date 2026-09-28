# Command Center Admin Sekolah — Mode TV

Halaman Ringkasan yang sama mendukung penggunaan administrator dan tampilan ruang guru.
Klik **Mode Layar TV** untuk menampilkan dashboard tanpa navigasi admin. Klik **Keluar layar TV** atau tekan **Esc** untuk kembali. Tombol arah kiri/kanan dan Tab dapat memindahkan fokus antara tombol keluar dan perbarui.

## Data dan visualisasi

- Empat kartu: siswa unik tercatat, berat setoran sampah, kunjungan perpustakaan, dan kehadiran ekstrakurikuler.
- Lima siswa paling awal hadir hari ini, berdasarkan CHECK_IN pertama per siswa; nama, kelas, dan jam hingga detik ditampilkan.
- Podium tiga kelas dengan total kilogram sampah tertinggi hari ini (organik + anorganik).
- Podium tiga kelas dengan jumlah kunjungan perpustakaan terbanyak hari ini. Kunjungan berulang tetap dihitung, sesuai metrik kunjungan; catatan tanpa kelas tidak masuk klasemen kelas.
- Podium menunjukkan urutan peringkat, bukan skala berat/jumlah kunjungan; angka aktual tercantum di setiap kelas. Selisih dua teratas ditampilkan.
- Waktu mengikuti zona sekolah. Nilai sama berbagi peringkat (contoh 1, 1, 3). Jika seri pada batas daftar, kelas diurutkan menurut nama lalu ID; siswa dengan waktu sama menurut ID catatan. Maksimal tiga kelas dan lima siswa tetap ditampilkan.
- Status konektivitas menampilkan ringkasan lima perangkat dari API dengan cakupan daftar yang jelas.

Endpoint baru `GET /api/v1/dashboard/rankings` membaca semua halaman data tenant sebelum menghitung peringkat. Endpoint menggunakan sesi pengguna dan RLS, memerlukan akses dashboard, presensi, sampah, dan perpustakaan. Tidak diperlukan migrasi database. API dan admin-web perlu dijalankan dengan versi terbaru bersama-sama.

Pemeriksaan data dilakukan setiap 30 detik selama halaman terlihat. API kartu ringkasan memiliki cache hingga dua menit; klasemen dihitung ulang saat diminta. Waktu pembaruan keduanya ditampilkan terpisah. Waktu data dan status koneksi tetap ditampilkan; kegagalan pembaruan mempertahankan snapshot terakhir. Timer dan permintaan aktif dihentikan saat berpindah halaman/sekolah atau keluar akun.

## Browser

Mode layar penuh menggunakan Fullscreen API dengan dukungan prefiks WebKit. Jika browser menolak atau tidak menyediakan API tersebut, tata letak TV tetap memenuhi area halaman; bilah browser mungkin tetap terlihat. Wake Lock diminta jika tersedia, tetapi pengaturan standby perangkat tetap bergantung pada TV/browser.

Referensi: https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen

## Validasi

- TypeScript admin dan build produksi.
- Unit test peringkat: zona waktu/pergantian hari, tap pertama, penjumlahan kilogram, peringkat seri, dan data kosong.
- Test endpoint: pagination melampaui 500 catatan, pembatasan tenant, permission, dan kegagalan database.
- Chrome lokal dengan API simulasi: layout 1920×1080 dan 1366×768, masuk/keluar fullscreen, Escape, fallback tanpa Fullscreen API, fokus keyboard, data kosong, gangguan API, dan penghentian polling saat navigasi.
- Data simulasi hanya digunakan oleh pengujian browser, tidak ditambahkan ke aplikasi.
- Belum diuji pada perangkat smart TV fisik.
