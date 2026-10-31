# Investigasi dan perbaikan PWA Kehadiran

Tanggal: 31 Oktober 2026. Lingkup: portal guru piket/satpam, API, Supabase, Jam Pelajaran admin, kartu orang tua, Command Center. Perubahan awal fitur berasal dari implementasi yang sudah ada pada commit `3f36121`; laporan ini menjelaskan pemeriksaan dan perbaikannya.

## Temuan awal

| Tingkat | Temuan | Dampak sebelum perbaikan |
|---|---|---|
| Kritis | Payload HP berbeda dari kontrak API; token QR diwajibkan API tetapi tidak dikirim HP | Sinkronisasi gagal validasi |
| Kritis | Keberhasilan sinkronisasi mengosongkan seluruh antrean | Pemindaian baru saat request berlangsung dapat hilang |
| Kritis | Antrean/history localStorage global tanpa sekolah/portal | Risiko tercampur saat berganti akses |
| Tinggi | Antrean menggunakan ID acak non-UUID; belum ada ledger kejadian dan batas unik harian yang konsisten | Retry dan duplikat lintas perangkat tidak andal |
| Tinggi | Penanggalan UTC digabung dengan jam lokal HP | Tanggal salah sebelum 08.00 WITA; penilaian terlambat salah |
| Tinggi | PWA belum mempunyai service worker/aset offline lengkap | Halaman yang sudah terbuka tampak offline, tetapi reload/decoder baru gagal |
| Tinggi | SQL provisioning memakai kolom RBAC yang tidak ada dan otorisasi yang tidak cocok dengan pemanggilan service role | Pembuatan akses QR, termasuk portal lain, dapat gagal |
| Tinggi | Proyeksi orang tua mengacu pada `marked_at` yang tidak ada | Kartu orang tua dapat gagal dimuat setelah migrasi awal |
| Sedang | Nama field pengaturan berbeda di admin/API/HP; default UI menyamarkan kegagalan | Jam tampak tersimpan/tersedia padahal tidak sesuai database |
| Sedang | Penghitungan hari memakai zona waktu server dan kehadiran mencampur arah masuk/pulang | Ringkasan harian berpotensi keliru |
| Sedang | Pembaca kamera tetap menerima hasil saat dialog alasan terbuka | Interaksi dan alasan pemindaian dapat saling menimpa |
| Sedang | CSS bersama menyembunyikan badge jaringan/antrean pada header | Petugas tidak melihat keadaan sinkronisasi |

## Perubahan yang diterapkan

### 1. Konsistensi database dan banyak HP

Migrasi forward `202610310006_attendance_consistency.sql` memperbaiki migrasi awal 005. Kedua migrasi diterapkan dalam satu transaksi, sehingga fungsi lama yang bermasalah tidak menjadi keadaan produksi antara.

- Satu kehadiran resmi per sekolah, siswa, tanggal sekolah, dan arah (CHECK_IN/CHECK_OUT), dilindungi indeks unik dan trigger tanggal.
- Waktu kejadian paling awal menang, bukan waktu request tiba. Jika B 07.35 masuk lebih dahulu lalu A 07.30 menyusul, baris resmi diperbarui menjadi 07.30. Status terlambat dan alasan mengikuti kejadian pemenang; alasan lama tidak ikut tertinggal.
- Setiap scan mempunyai event UUID dan device UUID. Ledger menyimpan kejadian yang diterima, diganti, duplikat, atau membutuhkan alasan. Replay ID yang sama tidak menambah kehadiran; ID yang digunakan untuk waktu/identitas berbeda ditolak.
- Penguncian transaksi per sekolah menghindari konflik antarbatch banyak siswa/alias kartu. Batas server 50 kejadian, HP mengirim 25 per batch.
- Data duplikat historis dipindahkan ke arsip terbatas, referensi receipt diarahkan ke baris resmi. Pada produksi sebelum penerapan jumlah attendance_logs adalah 0; tidak ada catatan sekolah yang dihapus oleh proses kanonisasi ini.
- Token QR cetak tidak dikirim bersama transaksi. Semua endpoint memakai sesi Bearer, sekolah aktif, izin `attendance.scan`, serta pemeriksaan pencabutan akses.
- Role GATE_STAFF dapat memindai seluruh kelas dalam sekolah, tanpa hak mengubah jam. Akses sekolah lain ditolak. Provisioning empat portal sebelumnya dipulihkan dan diuji regresi.

### 2. Penyimpanan dan sinkronisasi offline

- IndexedDB menyimpan transaksi secara atomik, dipisahkan dengan school_id + portal_id. Pemeriksaan duplikat lokal dilakukan dalam transaksi read/write yang juga melindungi dua tab pada HP yang sama.
- Respons server hanya mengubah ID yang benar-benar diakui dari batch terkait. Data baru yang ditulis selama request berjalan tetap ada. Respons sebagian tidak menghapus transaksi yang belum diakui.
- UI merekam secara lokal tanpa menunggu jaringan. Batch berjalan di latar belakang dengan jeda sekitar 8,5 detik; kegagalan jaringan tidak menghapus antrean atau menutup scanner.
- Riwayat membedakan tersimpan di HP, terkonfirmasi, waktu diganti, duplikat, perlu alasan, dan perlu pemeriksaan admin. Kejadian bermasalah dipertahankan dan dapat diekspor; alasan dapat dilengkapi dengan UUID dan waktu awal yang sama.
- Antrean global versi lama tidak otomatis dipindahkan ke sekolah aktif. Data lama dipertahankan, diberi pemberitahuan, dan disertakan pada ekspor pemeriksaan admin.
- Service worker memuat halaman, CSS, logo, ikon, dan chunk decoder QR yang lazily loaded ke cache. Tidak ada cache respons API atau token QR cetak.
- Data siswa offline harus disiapkan saat online. Snapshot berlaku 7 hari; pembaruan daftar siswa setiap 15 menit saat online atau melalui tombol perbarui. Jam sekolah dan kehadiran terbaru diperiksa melalui endpoint state ringan setiap 60 detik.
- Waktu HP dikalibrasi terhadap waktu server dan jam monoton selama halaman aktif; tanggal/penilaian memakai zona waktu sekolah. Perubahan jam HP besar selama sesi menghentikan pencatatan sampai waktu disamakan kembali.

### 3. Jam Pelajaran dan alasan

- Menu admin **Jam Pelajaran** (`/school-hours`), khusus SCHOOL_ADMIN, menggunakan kontrak field yang sama dengan API/HP. Pengambilan gagal tidak ditutupi default yang seolah-olah berasal dari database.
- Jam datang mulai, batas jam datang, dan jam pulang divalidasi urut dan sesuai format jam. Zona waktu mengikuti profil sekolah.
- Setiap perubahan jam mempunyai versi efektif. Scan offline lama dinilai dengan versi jam yang berlaku pada waktu kejadian, bukan diubah secara retroaktif oleh aturan baru.
- Batas 07.30 mencakup menit 07.30; terlambat mulai 07.31. Pulang sebelum 14.00 adalah pulang cepat, tepat 14.00 normal. Jam mulai datang ditampilkan sebagai awal jendela operasional; kedatangan lebih awal tetap dapat dicatat agar siswa tidak kehilangan bukti hadir.
- Popup **Siswa Terlambat** dan **Pulang Lebih Cepat** wajib mempunyai keterangan sebelum disimpan. Batal tidak mencatat transaksi baru. Scanner tidak menerima hasil baru ketika dialog sedang aktif.
- Server menghitung ulang status; flag dari HP tidak dipercaya. Jika aturan offline berbeda dan server membutuhkan alasan, kejadian dipertahankan sebagai NEEDS_REASON untuk dilengkapi.

### 4. Ekosistem dan UI

- Orang tua menerima waktu masuk/pulang resmi, flag, alasan per arah, dan teks **Hari ini Terlambat**, **Hari ini Pulang Cepat**, atau keduanya.
- Command Center menghitung siswa hadir dari CHECK_IN dan menghitung terlambat dari kedatangan resmi. Masuk dan pulang siswa yang sama tidak dihitung dua kali. Cache snapshot terkait dibatalkan ketika kehadiran resmi berubah.
- Tema hijau AKSIS, logo/header, kartu putih, dan mesin kamera bersama konsisten dengan tiga PWA lain. Tombol tetap di luar video, kontrol minimum 44px, dialog dapat digulir pada layar pendek, tampilan mengikuti HP/tablet.
- Badge online/offline dan antrean dipindahkan keluar area header yang disembunyikan CSS lama. Informasi kesiapan data offline dan ekspor antrean dapat diakses petugas.
- Lifecycle kamera dihentikan saat halaman tersembunyi/ditutup. Penyelesaian promise pemutaran video ditunggu sebelum kamera dapat dihentikan cepat; ini memperbaiki AbortError saat start/stop berdekatan tanpa menonaktifkan pelaporan error lain.

## Pengujian dan bukti

Hasil final dan bukti deployment dicatat pada `docs/analysis/2026-10-31/attendance/validation.json` dan `deployment.json`.

- Unit/kontrak/API: 246 tes pada 48 berkas, termasuk payload authenticated, hak ubah jam, sekolah, batas batch, tanggal WITA sebelum 08.00, cutoff, expiry dan alias kartu.
- PostgreSQL 17: semua migrasi dari awal, suite attendance mobile, parent dashboard, portal QR, reporting integrity, dan library. Sepuluh proses PostgreSQL bersamaan menghasilkan 10 kejadian audit, 1 kehadiran resmi 07.30, tidak terlambat.
- Uji rollback di Supabase produksi: kasus attendance dan parent/Command Center dijalankan tanpa menyisakan fixture sekolah atau transaksi; kemudian diulang setelah migrasi diterapkan.
- Browser production build: enam ukuran 320×568, 360×740, 390×844, 430×932, 768×1024, 844×390; antrean baru selama request tertunda, reload offline, decoder QR asli dengan virtual MediaStream, duplikat alias, UUID tetap, dan alasan datang/pulang.
- Regresi admin: sidebar, navigasi, layar mobile, menu Jam Pelajaran, cache dan lifecycle. Regresi kamera tiga PWA sebelumnya menggunakan html5-qrcode asli dan kamera virtual.

## Batas yang perlu dipahami

- Dua HP yang sama-sama offline tidak dapat langsung mengetahui pemindaian satu sama lain. Keduanya menunjukkan status lokal; deduplikasi lintas HP dan penetapan waktu resmi selesai ketika sinkronisasi berlangsung.
- Sinkronisasi berjalan saat PWA terbuka/aktif atau dibuka kembali. Browser/OS dapat menangguhkan aplikasi di latar belakang atau setelah ditutup; tidak dijanjikan pengiriman saat aplikasi sudah ditutup.
- Selama terputus total, server tidak dapat membuktikan jam perangkat atau pencabutan akses terkini. Batas offline 7 hari, deteksi perubahan jam, kalibrasi, dan penolakan waktu lebih dari 5 menit ke depan/30 hari ke belakang membatasi kesalahan; data yang ditolak tetap tersedia untuk pemeriksaan admin.
- QR statis sendiri tidak membuktikan bahwa siswa hadir secara fisik. Petugas harus menyaksikan dan mencocokkan siswa dengan kartu; UI menegaskan prosedur ini. Tidak ada klaim biometrik atau jaminan absolut pencegahan titip kartu.
- Pengujian kamera memakai Chromium/kamera virtual. Pengujian lapangan pada Android/iPhone fisik dan jaringan sekolah tetap diperlukan. Tidak ada klaim pengukuran latensi database sekolah atau transaksi nyata siswa dalam pengujian ini.

## Deployment

Migrasi Supabase 005 dan 006 sudah tercatat. Endpoint anonim untuk sinkronisasi dan helper private tidak memperoleh execute. Deployment Vercel dan pemeriksaan alias produksi dicatat pada artefak bukti; URL portal adalah `https://www.aksis.co.id/attendance/`, sedangkan `/attendance` tetap halaman riwayat admin.
