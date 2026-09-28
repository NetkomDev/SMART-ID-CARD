# Audit Super Admin dan produksi kartu — 27 September 2026

> Dokumen ini menyimpan temuan sebelum perbaikan. Tindak lanjut implementasi dan batas validasi terbaru ada di [SUPER_ADMIN_IMPLEMENTATION.md](SUPER_ADMIN_IMPLEMENTATION.md). Referensi baris di bawah merupakan posisi saat audit awal.

Kesimpulan: belum sepenuhnya sesuai blueprint dan belum siap untuk produksi kartu fisik NFC/RFID + QR dari awal sampai akhir. Fondasi database, API kartu, antrean writer, dan verifikasi sudah ada; sebagian besar kendali platform belum terhubung ke fungsi operasional.

## Cakupan dan batas bukti

Audit source lokal saat ini: `docs/BLUEPRINT.md`, Admin Web, API, Card Writer, dan migrasi SQL. Perubahan lokal yang belum di-commit termasuk dalam penilaian. Audit lama tidak dianggap sebagai bukti kondisi terbaru.

Tidak dilakukan login ke Supabase produksi, pemeriksaan kebijakan database terpasang, pencetakan fisik, atau pengujian alat. Temuan runtime/database harus dikonfirmasi di staging. Prioritas P0 berarti penghalang keamanan sebelum produksi; P1 berarti fungsi utama atau integritas operasional; P2 berarti kelengkapan pengelolaan.

Validasi yang dijalankan: `npx vitest run apps/card-writer/src/hardware.test.ts apps/api/src/schemas/card-writer.test.ts apps/admin-web/src/lib/permissions.test.ts apps/api/src/schemas/phase-04-05.test.ts` — 4 file, 13 test lulus. Tes ini memeriksa helper verifikasi, schema, dan permission frontend; tidak membuktikan pencetakan, integrasi hardware, keamanan RLS aktual, atau alur produksi lengkap.

Blueprint bagian 8–9 menetapkan kartu gabungan RFID + QR opaque; bagian 43–48 menetapkan antrean, baca QR sebelum write, dan verifikasi dua lapis. Blueprint belum merinci modul desain/cetak fisik maupun menyatakan seluruh pencetakan harus dilakukan Super Admin. Urutan cetak oleh Super Admin terlebih dahulu merupakan penajaman kebutuhan dari pengguna yang konsisten dengan alur baca QR pada blueprint.

## Temuan

### SA-01 — P1: pencetakan kartu dan pembuatan batch belum tersedia

Bukti: `apps/admin-web/src/app.ts:422`, `platformCardJobsPage()`, hanya merender empty state dan tombol tanpa handler. Tautan cepat “Cetak Kartu NFC” mengarah ke halaman ini. `cardsPage()` pada baris 614 hanya menampilkan ringkasan dan 50 kartu terakhir. Cetak pada modul laporan/Portal PWA merupakan fungsi berbeda, bukan cetak ID Card siswa.

Belum ada pemilihan sekolah/kelas/siswa untuk batch, template kartu, preview, QR kartu, ekspor hasil cetak, penandaan hasil cetak, cetak ulang, atau pelepasan batch ke station. API `/card-writer/jobs` tersedia tetapi tidak dipanggil halaman antrean tersebut.

Perbaikan: bangun modul Produksi Kartu yang memisahkan desain/cetak fisik dari penulisan chip. Snapshot data dan versi template per batch diperlukan agar cetak ulang dapat ditelusuri.

### SA-02 — P1: kartu aktif sebelum proses produksi terverifikasi

Bukti: `apps/api/src/routes/cards.ts:53` membuat kartu dengan default `ACTIVE` dan mengisi `issued_at`; schema `apps/api/src/schemas/card.ts` mewajibkan `card_uid` sejak awal. `complete_card_write_job()` hanya mengubah status job, bukan mengaktifkan kartu setelah verifikasi.

Dampak: tidak ada gerbang server yang memastikan cetak, pemeriksaan QR, dan penulisan berhasil sebelum kartu dinyatakan aktif. Claim job juga tidak memeriksa apakah kartu telah diblokir/hilang atau siswa sudah nonaktif.

Perbaikan: pisahkan status produksi dari status pemakaian. Identitas cetak dibuat sebelum UID chip tersedia; UID diikat ketika kartu fisik dibaca. Aktivasi harus transaksional setelah verifikasi RFID, QR, siswa, sekolah, dan job cocok. Blokir kartu harus menghentikan job terkait.

### SA-03 — P1: station masih simulator; pemilihan job belum berdasarkan QR fisik

Bukti: `apps/card-writer/src/main.ts:1` menggunakan `new SimulatorAdapter()` lalu claim → write → readBack. `hardware.ts:2` hanya menyimpan payload dalam memori dan mengembalikannya. `supabase/migrations/202609230010_phase_14_card_writer.sql:36` memilih job berdasarkan urutan `created_at`, tanpa parameter QR hasil scan.

Dampak: hasil sukses simulator belum membuktikan chip tertulis atau QR tercetak benar. Kartu fisik yang dimasukkan tidak menentukan job sebelum penulisan, berbeda dengan blueprint 45/48.

Perbaikan: sensor kartu → scan QR → resolve identitas dan job untuk sekolah station → lease job tersebut → baca UID → write payload → baca ulang chip dan scan ulang QR → cross-validation server. Tentukan kontrak terpisah untuk UID chip, isi memori RFID, dan QR; `expected_rfid = card_uid` saat ini belum mendefinisikan format data memori yang akan ditulis. Kredensial perangkat digunakan oleh station, bukan “API Key Super Admin” seperti petunjuk UI saat ini.

### SA-04 — P0: role tenant berpotensi menjadi kewenangan platform

Bukti: `apps/api/src/middleware/tenant.ts` mengambil role dari sekolah terpilih; `requireRole("SUPER_ADMIN")` hanya memeriksa kode tersebut. `routes/schools.ts` memakai pemeriksaan ini sebelum operasi service client membuat tenant/admin. Migrasi core baris 46 tidak mencadangkan kode SUPER_ADMIN untuk otoritas platform. Policy `roles_manage` dan `school_user_roles_manage` pada baris 415–423 memberi pengelola `iam.manage` wewenang perubahan role/assignment. Provisioning memberikan `iam.manage` kepada SCHOOL_ADMIN.

Risiko berdasarkan kode: bila akses tulis tabel melalui Supabase diberikan sebagaimana policy tersebut, admin tenant dapat membuat/menetapkan role bernama SUPER_ADMIN di tenant sendiri dan lolos pemeriksaan API platform. Eksploitasi belum dijalankan; perlu verifikasi grants aktual di staging.

Perbaikan: identitas/assignment administrator platform harus berada di boundary terpercaya yang tidak dapat diubah admin tenant. API platform memverifikasi otoritas global itu; cegah pemberian role platform melalui IAM sekolah, termasuk jalur database langsung.

### SA-05 — P1: daftar dan perpindahan lintas sekolah belum benar-benar global

Bukti: `requireTenant` menolak jika tidak ada membership aktif sekolah target. `/schools` memakai client pengguna; policy `schools_select_member` pada migrasi core baris 398 membatasi sekolah berdasarkan membership. Tombol “Buka Sekolah” hanya mengganti school ID dan melakukan bootstrap. Pendaftaran sekolah tidak menambahkan membership operator Super Admin ke sekolah baru.

Dampak: Super Admin yang hanya anggota sekolah platform tidak otomatis dapat melihat atau membuka sekolah baru. Menghapus filter tenant atau RLS bukan solusi.

Perbaikan: sediakan endpoint platform yang memverifikasi otoritas global dan operasi per sekolah dengan target eksplisit; catat aktor asli dan tenant sasaran saat akses dukungan. Uji dua sekolah dan satu akun Super Admin tanpa membership operasional di keduanya.

### SA-06 — P1: angka ringkasan platform dapat salah dan menyembunyikan error

Bukti: `apps/api/src/routes/schools.ts:58` memanggil tabel `cards`, sedangkan migrasi dan API menggunakan `student_cards`. Error empat query tidak diperiksa dan count null menjadi nol. Tidak ada filter ACTIVE pada statistik berlabel “Kartu NFC Aktif”. Query menggunakan client pengguna sehingga tetap dibatasi RLS.

Dampak: angka nol dapat berarti query gagal; jumlah yang disebut global dapat hanya mencakup sekolah yang terlihat oleh pengguna. Total perangkat juga bukan ukuran perangkat online.

Perbaikan: agregasi platform terotorisasi, tabel benar, definisi metrik eksplisit, filter status/soft-delete, dan tampilkan error saat query gagal.

### SA-07 — P1: provisioning sekolah/admin tidak menjamin sukses utuh

Bukti: `apps/api/src/routes/schools.ts:74` membuat sekolah, roles, permissions, Auth user, profil, membership, assignment melalui operasi terpisah. Beberapa hasil error diabaikan; endpoint tetap mengirim 201 dan kredensial walau Auth gagal. Endpoint `/:id/admin` dapat meninggalkan Auth user tanpa membership atau role jika langkah lanjutan gagal.

Dampak: sekolah tampak siap tetapi admin tidak dapat digunakan; percobaan ulang dapat bertabrakan dengan data parsial.

Perbaikan: transaksi untuk data database, workflow/kompensasi untuk Auth, idempotency key, validasi input, status provisioning, dan respons sukses hanya setelah hak akses lengkap.

### SA-08 — P1: permission hasil provisioning tidak cocok dengan sejumlah modul

Bukti: daftar default pada `routes/schools.ts` memiliki `waste.manage` dan `library.manage`, tetapi policy transaksi waste memerlukan `waste.read`/`waste.create`; library memerlukan `library.read`. Default juga tidak mencakup `parent.manage`. Role non-admin yang dibuat tidak memperoleh grant di proses ini. `requirePermission` melewati pemeriksaan untuk admin sementara fungsi SQL `has_school_permission` tetap memerlukan grant eksplisit.

Dampak: lolos API belum berarti lolos RLS/RPC. Sebagian fitur admin/operator sekolah baru dapat kosong atau ditolak. Endpoint service/RPC khusus harus dinilai tersendiri; temuan ini tidak menyatakan semua modul gagal.

Perbaikan: satu katalog permission yang konsisten untuk provisioning, API, UI dan database, dengan matriks grant per role dan tes sekolah baru.

### SA-09 — P1: IAM platform hanya katalog statis

Bukti: `apps/admin-web/src/app.ts:426` merender tabel hardcoded tanpa pengambilan akun, membership, permission, atau handler pengubahan akses.

Belum tersedia pengelolaan assignment, penonaktifan akses, dan pemeriksaan hak aktual. Teks katalog menyebut fitur seperti pembayaran/nilai/sirkulasi yang bukan bukti bahwa fungsi itu tersedia.

Perbaikan: tampilkan akun dan akses aktual, dengan scope sekolah dan boundary platform SA-04 diselesaikan lebih dahulu.

### SA-10 — P1: monitor perangkat global belum tersedia; online disamakan dengan ACTIVE

Bukti: route `/platform-devices` pada `app.ts:1382` memanggil placeholder. Tombol tambah perangkat sekolah pada `devicesPage()` hanya alert. API registrasi dan heartbeat tersedia di `routes/devices.ts`; summary menghitung status administratif ACTIVE, bukan kesegaran heartbeat.

Dampak: station tidak dapat didaftarkan lewat UI ini dan perangkat ACTIVE yang terputus bisa dilabeli online.

Perbaikan: registrasi/pemberian kredensial per station, monitor lintas sekolah terotorisasi, heartbeat timeout, status gangguan, serta manajemen pencabutan/rotasi kredensial. Sesuaikan dengan blueprint 21–23 dan 56.

### SA-11 — P1: audit global belum tersedia dan isi audit belum cukup untuk penelusuran

Bukti: `/platform-audit` memanggil placeholder. Endpoint `routes/reporting.ts:5` membatasi log ke sekolah terpilih. `middleware/audit.ts` mencatat mutasi sukses setelah respons, tetapi resource ID, before/after bernilai null; kegagalan append hanya dilog. Operasi device yang dipasang sebelum middleware audit tidak otomatis tercakup olehnya.

Dampak: belum dapat menelusuri perubahan lintas sekolah maupun memastikan perubahan penting dan audit tersimpan bersama. Saat membuat admin tenant lain, school ID audit mengikuti konteks pemanggil, bukan otomatis tenant target.

Perbaikan: audit aksi domain berisi aktor, sekolah target, resource, hasil, perubahan relevan tanpa secret, serta pencatatan transaksional/outbox untuk aksi penting. Log cetak/cetak ulang dan penggantian kartu perlu ditambahkan.

### SA-12 — P1: pemulihan antrean dapat meninggalkan job macet

Bukti: claim SQL mensyaratkan `attempt_count < max_attempts` untuk mengambil kembali lease kedaluwarsa. Job pada percobaan terakhir yang tidak sempat complete tidak dipilih lagi dan tidak otomatis menjadi FAILED. Complete hanya menerima status LEASED, sehingga pengiriman ulang setelah sukses akan ditolak. Client mengirim error hardware sebagai complete, tetapi SQL memperlakukannya sebagai mismatch/hard failure dan parameter retryable tidak digunakan untuk retry.

Perbaikan: reaper lease habis dengan hasil terminal yang jelas, complete idempotent, pembedaan kegagalan transport dan mismatch identitas, serta UI retry/reconcile dengan histori percobaan. Larangan mismatch tetap harus tegas.

### SA-13 — P2: lifecycle kartu dan tenant belum dapat dikelola penuh lewat UI

Bukti: tabel kartu tidak memiliki aksi blokir/hilang/penggantian meskipun API status tersedia. Statistik “Diblokir/Hilang” hanya menghitung BLOCKED. Daftar sekolah memiliki tambah sekolah/tambah admin/masuk dashboard, belum pengubahan profil atau penonaktifan sekolah. Daftar kartu dibatasi 50 terakhir tanpa navigasi halaman.

Perbaikan: tambahkan aksi lifecycle dengan alasan dan audit, pencarian/paginasi/filter, penggantian yang menghubungkan kartu lama dan baru, serta pengaturan status tenant dengan aturan dampaknya.

## Alur produksi yang direkomendasikan

1. Super Admin memilih sekolah, tahun ajaran, kelas, dan siswa; validasi data identitas dan kelayakan penerbitan/penggantian.
2. Server membuat identitas kartu dan QR opaque unik per kartu. QR tidak memuat nama/NISN dan bukan token login Portal PWA orang tua.
3. Buat batch serta snapshot data/template; tampilkan preview depan/belakang dan hasil siap cetak sesuai printer.
4. Cetak kartu dan lakukan konfirmasi hasil/QC. Memanggil dialog print saja tidak membuktikan kartu tercetak.
5. Kartu lolos QC berstatus siap ditulis. Cetak ulang dicatat beserta alasan; kartu reject tidak boleh dilepas ke station sebagai kartu sah.
6. Station membaca QR fisik, server mencocokkan sekolah, identitas kartu, dan job yang memang siap diproses.
7. Baca UID chip, ikat kartu fisik ke identitas cetak, tulis payload yang disepakati, baca ulang chip dan QR.
8. Server cross-validate; jika cocok, tandai job sukses dan aktifkan kartu secara atomik. Jika tidak cocok, gagalkan dan karantina kartu.
9. Catat operator, station, batch, percobaan, waktu, hasil, dan proses serah terima.

Usulan status produksi (belum implementasi): DRAFT → READY_TO_PRINT → PRINTED → READY_TO_WRITE → WRITING → VERIFIED. FAILED, CANCELLED, dan REJECTED adalah jalur pengecualian. Status pemakaian ACTIVE/LOST/BLOCKED/REPLACED/EXPIRED tetap terpisah. Kartu yang belum VERIFIED tidak boleh dipakai untuk transaksi.

## Bagian yang sudah menjadi fondasi

- Model siswa terpisah dari kartu; kartu memiliki UID, serial, QR, dan status.
- API daftar/buat/ubah/blokir kartu dengan school ID.
- Antrean writer memakai idempotency key saat create, lease token, batas percobaan, dan locking saat claim.
- Penyelesaian job membandingkan kedua hasil RFID/QR; mismatch menghasilkan FAILED.
- Log writer dibuat immutable melalui trigger; autentikasi station memakai secret perangkat.
- API registrasi perangkat, heartbeat, audit per sekolah, serta Supabase Auth/RLS sudah tersedia sebagai fondasi.

Ini menunjukkan sistem tidak perlu dimulai ulang, tetapi keberadaan backend tidak berarti halaman Super Admin sudah selesai.

## Urutan pengerjaan dan kriteria penerimaan

1. Perbaiki boundary platform dan provisioning: admin tenant tidak bisa mendapat hak platform lewat role sekolah; Super Admin dapat mengelola dua tenant tanpa membocorkan akses kepada akun biasa; kegagalan provisioning terlihat dan dapat dipulihkan.
2. Implementasikan produksi/cetak kartu dan state server: QR unik, batch/preview/cetak/QC/cetak ulang, kartu belum aktif sebelum verifikasi, kartu ditolak tidak dapat diantrekan.
3. Integrasikan station fisik: urutan kartu acak tetap memilih job sesuai QR; salah QR/chip/sekolah gagal sebelum aktivasi; blokir saat proses, lease habis, restart, dan timeout penyelesaian dapat direkonsiliasi.
4. Lengkapi IAM, monitor, audit, statistik dan lifecycle: angka diverifikasi terhadap data staging, heartbeat kedaluwarsa tampil offline, log menyebut aktor/tenant/kartu yang benar.

Validasi fisik wajib meliputi ukuran dan posisi cetak, keterbacaan QR hasil printer, pembacaan/penulisan chip nyata, serta hasil pemindaian kartu pada perangkat operasional. Kontrak memori chip dan interface alat perlu ditetapkan sebelum menyatakan integrasi hardware selesai.
