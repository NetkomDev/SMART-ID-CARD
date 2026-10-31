# Laporan desain scanner dan interkoneksi tiga PWA

Tanggal: 31 Oktober 2026, WITA.
Lingkup: Piket Bank Sampah, Perpustakaan, Ekstrakurikuler.

## Temuan dan perbaikan

| Temuan | Perbaikan |
| --- | --- |
| Desain scanner tersebar di CSS tiap PWA dan satu stylesheet global dengan banyak `!important`. Kontrol dapat saling menimpa; zoom bahkan muncul saat kamera tidak aktif. | Satu stylesheet scanner bersama. Aturan scanner lama pada tema global dihapus; struktur HTML disamakan pada tiga aplikasi. |
| Kamera, placeholder, tombol, zoom dan status bercampur dalam satu area yang berubah tinggi. | Pratinjau persegi memiliki area tersendiri; tombol utama 48 px, ganti kamera 44 px, status, dan input manual berada di luar video. Kamera gelap ditempatkan dalam kartu terang yang mengikuti warna AKSIS. |
| Dua aplikasi memakai QR box tetap 250×250, berpotensi tidak muat pada HP kecil. | QR box dihitung dari dimensi video: 76% sisi tersedia, dibulatkan, dengan batas 240 px. Bingkai dikalibrasi ulang ketika ukuran pratinjau/orientasi berubah. |
| Pengulangan kode kamera dan start/stop yang tidak terserialisasi dapat meninggalkan stream sesudah pengguna membatalkan izin atau berpindah halaman. | Komponen `QRCamera` bersama mengurutkan start/stop, membatalkan pembukaan tertunda, menghentikan stream saat halaman tersembunyi/pagehide, dan menahan callback ganda. |
| Zoom memakai constraint perangkat sekaligus pembesaran CSS sehingga gambar yang terlihat dapat berbeda dari gambar yang didekode. | Zoom hanya menggunakan kemampuan perangkat. Kontrol disembunyikan jika tidak didukung; video tidak diperbesar dengan CSS. |
| Pemrosesan touch dipasang pada seluruh window dan dapat mengganggu respons gulir. | Pendengar gesture dibatasi pada pratinjau kamera; area lain tetap mengikuti interaksi browser. |
| Pembaca mencoba berbagai format barcode walaupun alur menggunakan QR. | Modul scanner dimuat saat diperlukan, hanya format QR, 8 frame/detik. Ini mengurangi frekuensi percobaan dekode dari konfigurasi 10 fps sebelumnya; besarnya penghematan CPU tergantung perangkat. |
| Scanner login menerima URL bertoken tanpa membatasi situs/portal tujuan. | Tautan akses harus memiliki token 64 heksadesimal, berasal dari situs yang diizinkan dan sesuai jalur aplikasi. QR siswa tidak dianggap QR akses portal. |
| Piket Sampah mencoba endpoint kartu, lalu pencarian siswa terpisah ketika tidak cocok. Pencarian parsial dapat mengembalikan banyak siswa. | Endpoint `POST /students/resolve` mengenali NIS/NISN lengkap secara persis dan tetap menggunakan RPC otorisasi kartu untuk QR/NFC. Nomor ambigu ditolak; hasil mengikuti RLS kelas/sekolah. |
| Perpustakaan mencari siswa dan kartu melalui service-role sebelum memanggil RPC yang sudah mendukung NISN/NIS/kartu. | Seluruh pencarian tambahan tersebut dihapus. Pencatatan memakai satu `record_portal_library_visit` melalui klien pengguna yang terotorisasi. |
| Perpustakaan dan Ekskul menampilkan sukses dari cache sebelum penyimpanan server. Kegagalan di latar belakang bisa tidak terlihat. | Jalur sukses optimistis dihapus. Sukses muncul setelah respons penyimpanan; kegagalan ditampilkan. Cache profil lama tidak dipakai dan dibersihkan. |
| Ekskul melakukan identifikasi dan pencatatan dalam dua permintaan browser yang masing-masing melewati autentikasi/tenant. | Endpoint `POST /extracurriculars/:id/sessions/:sessionId/scan` menyatukan keduanya. Keanggotaan tetap diperiksa; siswa yang belum menjadi anggota memerlukan persetujuan pendaftaran melalui dialog. |
| Refresh token yang selesai setelah sesi diganti/dihapus dapat mengembalikan identitas lama. | Hasil refresh ditolak bila identitas atau refresh token berubah. Respons dari portal lama tidak dipakai pada portal baru. |
| Permintaan baca bersamaan dapat berulang; ringkasan lama dapat menimpa data baru. | Hanya GET yang sedang berjalan digabung per portal/sekolah/token/path. Hasil tidak disimpan sebagai cache jangka panjang. POST menginvalidasi baca yang sedang berjalan; versi respons menjaga ringkasan terbaru. |
| Logo besar dipakai di header ponsel. | Logo turunan WebP 192 px mempertahankan aset asli: 788.650 → 20.402 byte per aplikasi. Service worker diperbarui ke versi v11 dan mendukung WebP. |

Perpustakaan juga mendapat tombol **Pindai siswa berikutnya** agar petugas tidak harus menunggu overlay selesai otomatis. Input nomor tetap tersedia jika kamera tidak ditemukan/izin ditolak; keyboard angka digunakan untuk nomor siswa.

## Alur backend dan Supabase

### Piket Bank Sampah

`QR/NIS/NISN → /students/resolve → identitas terotorisasi → input berat → /waste/transactions → konfirmasi server → ringkasan`.

- NIS/NISN menggunakan satu kueri persis, memilih hanya identitas yang diperlukan.
- Jika nomor tidak merupakan NIS/NISN, fallback numerik RFID tetap memakai RPC kartu.
- QR/kartu menggunakan `resolve_student_card`, termasuk pemeriksaan status kartu dan lingkup portal.
- Alur setoran mempertahankan `event_id` dan payload yang sama saat hasil jaringan belum pasti, sehingga retry tidak menggandakan setoran.

### Perpustakaan

`QR/NIS/NISN → /library/visits → record_portal_library_visit → konfirmasi server → ringkasan harian`.

- Berkurang dari hingga tiga perjalanan database (pencarian siswa, kartu, RPC) menjadi satu RPC pada jalur pencatatan portal.
- RPC yang sudah ada menangani identifikasi, validasi, transaksi, dan idempotensi; tidak ada SQL baru yang memindahkan batas otorisasi.
- Antrean offline tetap memakai `event_id` yang sama. UI menyebut **tertunda**, bukan sukses, bila belum dikonfirmasi.
- Permintaan manual/kamera ditahan selama kunjungan sedang diproses.

### Ekstrakurikuler

`QR/NIS/NISN → endpoint scan → resolusi identitas + pemeriksaan anggota + insert presensi → konfirmasi server`.

- Dua permintaan browser menjadi satu untuk identifikasi dan pencatatan normal; autentikasi dan pemeriksaan tenant tidak diulang melalui dua endpoint terpisah.
- Endpoint tetap memakai klien pengguna dan kebijakan database. Permission `student.read` serta `extracurricular.attendance` diperlukan.
- Keanggotaan tidak aktif ditolak. Siswa tanpa keanggotaan ditampilkan dalam dialog pendaftaran; tidak didaftarkan diam-diam.
- Presensi yang sama dikembalikan sebagai duplikat melalui aturan idempotensi yang sudah ada.

Tidak diperlukan migrasi Supabase baru untuk pekerjaan scanner ini. Fungsi dan kebijakan yang dipakai sudah tersedia. Tidak ditambahkan cache otorisasi lintas pengguna atau akses service-role di browser. Pemuatan pertama dan konfirmasi transaksi tetap bergantung pada jaringan; perbaikan ini tidak menyamarkan penyimpanan yang gagal sebagai sukses instan.

## Verifikasi

- Pemeriksaan tipe dan build seluruh aplikasi serta **231 pengujian pada 45 berkas lulus**.
- Pengujian terarah: 26 pengujian untuk lifecycle kamera, adaptasi QR box, pembatasan tautan login, scope identitas, penolakan nomor ambigu, RPC tunggal Perpustakaan, pencatatan Ekskul, keanggotaan, duplikat, penggabungan GET dan penggantian sesi.
- Browser dengan adapter kamera uji: 3 aplikasi × 6 ukuran layar = 18 kasus. Ukuran 320×568, 360×740, 390×844, 430×932, 768×1024, 844×390. Tidak ada overflow halaman atau tumpang tindih tombol dengan kamera.
- Browser memakai **html5-qrcode sebenarnya** dan MediaStream virtual Chromium: kamera hidup/mati di semua PWA; perubahan orientasi menghasilkan frame dan panduan QR 190×190 tanpa keluar area.
- QR sintetis 48 karakter benar-benar didekode dari video Y4M oleh pustaka scanner, lalu diteruskan sekali ke alur masing-masing aplikasi. Data backend pada pengujian browser adalah fixture, tidak menulis transaksi sekolah sebenarnya.
- Kegagalan penyimpanan tidak menampilkan sukses; antrean offline Perpustakaan mengirim ulang event yang sama; anggota baru Ekskul memerlukan dialog persetujuan.
- PostgreSQL 17 sekali pakai: semua migrasi dan suite `phase_11_library_integration.sql` serta `portal_qr_integration.sql` lulus.

Bukti: `docs/analysis/2026-10-31/pwa-scanners/`. Skrip: `tooling/test-pwa-scanners.mjs`, `tooling/test-pwa-camera-device.mjs`, `tooling/create-scanner-test-video.mjs`.

Batas pengujian: emulasi ukuran layar dan kamera virtual desktop, bukan kamera HP fisik. Ketajaman, autofocus, pencahayaan, zoom hardware dan waktu respons jaringan sekolah perlu dicoba pada perangkat yang dipakai petugas. Tidak ada angka percepatan produksi yang diklaim tanpa pengukuran pengguna nyata.

## Deployment

- **READY**, 31 October 2026 14.30 WITA, deployment `dpl_5HkBZrvz1wuL8KE5WXJrgitcicRr`.
- URL immutable: https://aksis-bpvafv1sg-netkom-developers-projects.vercel.app.
- Domain produksi: https://www.aksis.co.id, alias dicocokkan langsung ke deployment tersebut.
- Halaman `/waste/`, `/library/`, `/extracurricular/`, aset scanner baru, logo, service worker v11 serta penolakan akses tanpa autentikasi: **PASS**.
- Seluruh sembilan entrypoint platform, kesehatan API dan aset admin: **PASS**.
- Kamera virtual dengan SDK sebenarnya dan video QR sintetis juga diuji pada domain produksi ketiga PWA: **PASS**. Data API pada uji kamera memakai fixture; tidak ada transaksi sekolah yang dibuat.
- Dashboard Admin turut diverifikasi melalui UI produksi dengan data fixture: 12 menu, layout dan lifecycle navigasi **PASS**.

Bukti produksi tersimpan di `deployment.json`, `production-smoke.json`, `platform-smoke.json`, `production-camera.json`, dan `production-decoded-qr.json`. Deployment ini mendahului penambahan PWA Kehadiran; laporan investigasi kehadiran dibuat terpisah.
