# Super Admin dan produksi kartu

Perubahan lokal menindaklanjuti audit 27 September 2026. Menu platform sekarang mengambil data API, bukan katalog/placeholder. Implementasi hardware menggunakan kontrak serial yang dijelaskan di bawah; firmware alat dan kalibrasi printer harus diuji pada alat sebenarnya.

## Instalasi

1. Terapkan migrasi berurutan `202609270018` sampai `202609280025` ke staging setelah migrasi sebelumnya. Uji di staging sebelum peluncuran. Migrasi baru telah disiapkan dalam repositori; mengubah source tidak otomatis memperbarui Supabase remote.
2. Pastikan API memiliki `SUPABASE_SERVICE_ROLE_KEY`. Nilai tersebut hanya berada di server. Client manusia tetap menggunakan RLS dan station menggunakan token perangkat.
3. Tetapkan akun platform yang sudah diverifikasi melalui trusted Auth `app_metadata.platform_role = SUPER_ADMIN`. Contoh perintah operator: `node tooling/platform-authority.mjs grant <auth-user-uuid>`. Profil `public.users` harus aktif. Perintah `revoke` mencabutnya. Tool ini belum dijalankan terhadap akun produksi; UUID operator harus ditentukan secara eksplisit.
4. Deploy API, Admin Web dan Card Writer bersama kontrak baru. Masuk ulang setelah migrasi otoritas. Role `SUPER_ADMIN` lama di tabel role sekolah tidak lagi memberikan kewenangan platform. Tidak ada promosi otomatis role tenant menjadi administrator global.
5. Jangan menjalankan seed demo pada data produksi. Seed hanya disesuaikan untuk pengembangan yang memang membuat ulang data demo.

Kompatibilitas: kartu lama diberi `production_status=LEGACY`, bukan dianggap sudah melalui verifikasi fisik baru. Status pemakaian lama tetap dipertahankan. Kartu produksi baru berawal DRAFT/BLOCKED tanpa UID. Antrean writer lama yang belum selesai dibatalkan dengan kode `LEGACY_QUEUE_REQUIRES_QC`; lakukan inventarisasi dan QC sebelum penerbitan ulang. Cadangkan data dan periksa antrean lama saat rollout.

## Halaman platform

- Ringkasan: jumlah sekolah, siswa aktif, perangkat dengan heartbeat dua menit terakhir, dan kartu aktif yang belum kedaluwarsa. Query gagal menghasilkan error, bukan angka nol.
- Sekolah: tambah sekolah beserta administrator, tambah administrator, ubah nama/zona waktu/status. Dashboard platform terpisah dari operasional sekolah; sekolah tujuan dipilih di modul platform seperti produksi kartu.
- IAM: membership, role dan permission aktual, perubahan role/status. Administrator sekolah terakhir tidak dapat dinonaktifkan melalui halaman ini. Otoritas platform dikelola terpisah.
- Perangkat: pendaftaran, Device ID/token, status administratif, heartbeat, rotasi/pencabutan token lama. Menonaktifkan perangkat menghentikan autentikasinya; rotasi token membutuhkan konfigurasi ulang station.
- Produksi kartu: pemilihan siswa dengan filter sekolah/kelas/tahun ajaran, batch maksimal 200 siswa, preview depan, cetak depan/belakang, PDF melalui dialog browser, QC, antrean writer, histori percobaan, retry dengan alasan, pembatalan, blokir/hilang dan penerbitan pengganti. Daftar memakai paginasi.
- Audit: log lintas sekolah, aktor, resource, sebelum/sesudah untuk perubahan domain yang dicatat. Mutasi sekolah/perangkat serta produksi/IAM mempunyai audit dalam transaksi database. Middleware audit generik tetap tersedia untuk modul lain.

## Produksi kartu

1. Buat batch dari siswa aktif. Server membuat QR acak unik 24 byte (48 karakter hex), identitas kartu, serial, serta snapshot teks dan versi template.
2. Preview/cetak menggunakan template `aksis-v1`. Pilih A4 atau satu kartu per halaman; ukuran template awal 85,6 × 54 mm. Cetak depan dan belakang dilakukan terpisah. Pengaturan duplex/orientasi printer dan kecocokan sisi wajib diperiksa pada printer tujuan.
3. Setelah hasil fisik selesai, konfirmasikan cetak. Cetak ulang harus dicatat dan hasil reject dimusnahkan. QR yang tercetak tidak berubah pada cetak ulang batch yang belum dilepas.
4. Setelah semua kartu batch lolos pemeriksaan QR, lepaskan ke antrean. Membuka dialog print tidak menandai kartu sebagai sudah tercetak.
5. Station scan QR fisik dan baca UID chip. Server memilih job berdasarkan QR dalam sekolah station, mengikat UID, dan memberikan lease.
6. Station menulis payload `AKS1:<qr_key>` ke memori aplikasi. UID chip dibaca sebagai identitas fisik dan tidak ditulis ulang.
7. Station membaca kembali chip dan petugas men-scan ulang QR fisik. Server memeriksa UID, isi memori, QR, status siswa/kartu, station, dan lease. Hanya hasil cocok yang mengaktifkan kartu.
8. Kartu pengganti mendapat QR baru. Kartu lama harus diblokir/hilang/kedaluwarsa sebelum penerbitan pengganti; kartu lama menjadi REPLACED setelah pengganti lolos verifikasi.

Status produksi: DRAFT → PRINTED → READY_TO_WRITE → WRITING → VERIFIED; FAILED/CANCELLED untuk pengecualian, LEGACY untuk data sebelum migrasi. Status penggunaan ACTIVE/LOST/BLOCKED/REPLACED/EXPIRED terpisah. Mengubah status menjadi ACTIVE tidak dapat melewati pemeriksaan produksi kartu baru.

Pemulihan: lease kedaluwarsa direkonsiliasi ketika antrean dibuka atau station claim; percobaan terakhir menjadi FAILED. Retry eksplisit maksimal sepuluh percobaan; histori lama dipertahankan. Hasil completion bersifat idempotent untuk device dan lease yang sama. Browser station menyimpan job/hasil tertunda dalam sessionStorage agar refresh tab dapat dipulihkan; token perangkat hanya di memori. Penutupan tab/kehilangan perangkat membutuhkan rekonsiliasi dari antrean dan scan ulang, bukan asumsi sukses.

## Kontrak alat Card Writer

Jalankan `npm run dev:card-writer`; jika script dev belum tersedia, gunakan `npx vite --config apps/card-writer/vite.config.ts`. Proxy API menuju localhost:3000 dan port frontend 4180. Browser harus mendukung Web Serial. Sambungkan alat melalui tombol, dengan Device ID/token jenis CARD_STATION.

Komunikasi serial 115200 baud, JSON per baris UTF-8 diakhiri newline. Setiap respons harus membawa `id` request. Timeout respons 15 detik. Scanner QR dapat bertindak sebagai input keyboard pada field scan dan scan ulang.

```json
{"id":"request-uuid","command":"READ_CARD"}
{"id":"request-uuid","ok":true,"uid":"04AABBCCDD","payload":""}
```

```json
{"id":"request-uuid","command":"WRITE_CARD","expected_uid":"04AABBCCDD","payload":"AKS1:<48-character-qr-key>"}
{"id":"request-uuid","ok":true}
```

Firmware wajib memeriksa kartu masih terpasang dan UID sama dengan `expected_uid` sebelum menulis. Ketidakcocokan harus ditolak tanpa write. READ_CARD harus membaca memori fisik, bukan mengembalikan cache permintaan WRITE_CARD. UID adalah hex uppercase 8–20 karakter. Payload aplikasi ASCII maksimal 64 karakter. Tata letak blok memori, kunci akses chip, sensor, buzzer/LED dan firmware sesuai reader yang dipilih belum dapat divalidasi tanpa spesifikasi/perangkat fisik.

```json
{"id":"request-uuid","ok":false,"error":"CARD_CHANGED"}
```

Adapter simulator tetap hanya untuk unit test/helper lama; entrypoint produksi menggunakan SerialCardAdapter. Sukses simulator tidak mengaktifkan alur station produksi.

## QR pada layanan sekolah

QR kartu adalah identifier, bukan token login portal. `/cards/resolve` memeriksa autentikasi, permission, sekolah, status kartu/siswa, dan scope kelas portal. Bank sampah dan ekskul mengenali QR baru; pencarian nomor siswa lama masih tersedia untuk input manual. Perpustakaan menerima QR atau UID melalui endpoint kunjungan dan menampilkan nama pemilik setelah pencatatan berhasil. Kartu LOST/BLOCKED/REPLACED/EXPIRED tidak dapat di-resolve sebagai kartu aktif.

## Provisioning dan gangguan koneksi

Database sekolah/profil/membership/role dibuat atomik melalui RPC service-only yang memeriksa aktor platform. API tidak mengirim sukses jika salah satu tahap gagal. Idempotency key disimpan UI per hash formulir (tanpa menyimpan password). Retry formulir yang sama memakai operasi yang sama.

Auth berada di luar transaksi PostgreSQL. Identitas Auth ditentukan secara konsisten per aktor/operasi menggunakan HMAC server; password awal memakai domain HMAC berbeda dari UUID. Jika proses terputus setelah Auth dibuat, retry mengenali metadata operasi dan melanjutkan transaksi. Akun Auth staging tanpa membership tidak mendapat akses tenant. Error ambigu dilaporkan sebagai perlu rekonsiliasi; tidak menghapus akun yang mungkin sudah berhasil dibuat oleh retry lain. Simpan operation ID saat eskalasi. Perubahan service key di tengah operasi memerlukan rekonsiliasi akun pending sebelum retry; jangan menganggap kredensial awal masih berlaku setelah reset password.

## Pengujian yang dapat diulang

Hasil lokal 27 September 2026: seluruh 119 tes unit/API yang ada lulus; tiga tes adapter serial tambahan dan 30 tes regresi API juga lulus setelah perubahan terakhir (122 tes unik). Seluruh migrasi 001–024 berhasil diterapkan pada database sementara; suite Super Admin/produksi, portal QR, dan perpustakaan lulus. Typecheck seluruh portal/API dan Card Writer, build Admin Web/Card Writer, serta skenario browser desktop/mobile dan PDF lulus. YAML OpenAPI dan semua referensi lokalnya tervalidasi. Browser menggunakan fixture API, sedangkan SQL menggunakan stub Auth lokal.

| Temuan audit | Tindak lanjut lokal |
| --- | --- |
| SA-01 | Batch, snapshot template, preview, cetak/PDF, konfirmasi cetak dan QC |
| SA-02 | Status produksi terpisah, aktivasi transaksional setelah verifikasi |
| SA-03 | Claim berdasarkan QR fisik dan adapter Web Serial; validasi alat nyata masih diperlukan |
| SA-04–05 | Otoritas platform dari trusted Auth metadata, akses lintas sekolah diverifikasi server |
| SA-06 | Statistik memakai tabel kartu sebenarnya, heartbeat dan penanganan error |
| SA-07–08 | Provisioning database atomik, retry Auth idempotent, grant permission konsisten |
| SA-09–11 | IAM aktual, monitor/manajemen perangkat, audit domain transaksional |
| SA-12 | Rekonsiliasi lease, hasil idempotent, retry terbatas dan histori percobaan |
| SA-13 | Lifecycle sekolah/kartu, paginasi, blokir/hilang dan kartu pengganti |

Bukti ini menutup perbaikan source lokal untuk temuan audit, bukan menyatakan penerimaan produksi atau integrasi perangkat fisik selesai.

- `npm test`: unit/API termasuk guard platform dan kontrak writer.
- `npm run typecheck:portals` dan `npx tsc -p apps/card-writer/tsconfig.json --noEmit`.
- `npm run build:admin` dan `npm run build:card-writer`.
- `npm run test:db:super-admin`: memerlukan PostgreSQL lokal; membuat cluster sementara, menerapkan seluruh migrasi, menjalankan tes SA/produksi/portal/library, lalu menghapus cluster. Stub Auth digunakan hanya untuk pengujian SQL; bukan pengganti uji Supabase Auth sebenarnya.
- `npm run test:browser:super-admin`: memerlukan Puppeteer dan Chrome. `AKSIS_PUPPETEER_MODULE` dapat menunjuk modul Puppeteer lokal; `AKSIS_CHROME` menunjuk executable; `AKSIS_ADMIN_URL` default localhost:4193. Tes memakai API fixture, memeriksa navigasi, preview, PDF, cetak/QC/release dan mobile, bukan backend produksi.

Batas validasi: belum menerapkan migrasi ke Supabase remote, menetapkan akun platform produksi, menguji GoTrue/service key produksi, mencetak kartu nyata, atau menulis chip nyata. Hasil unit/SQL/browser tidak menggantikan pemeriksaan tersebut.
