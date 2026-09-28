# Portal PWA & QR

## Perilaku

Admin sekolah membuka Portal PWA & QR, memilih kelas untuk Bank Sampah atau siswa untuk Orang Tua, lalu membuat QR. Perpustakaan dan Ekstrakurikuler menggunakan lingkup sekolah. QR dapat diunduh sebagai PNG, dicetak, atau dicoba melalui tombol Buka portal. Setiap QR merupakan kunci masuk: bagikan kepada pengguna yang berhak.

Pengguna memindai QR dengan kamera smartphone. Portal menukar token dengan sesi Supabase dan membuka dashboard tanpa meminta username/password. Akun teknis dibuat backend melalui Supabase Auth Admin API; pengguna tidak mengelola akun itu. Token QR berada dalam fragment URL (`#token=...`) dan dihapus sebelum request login. Token mentah tidak disimpan dalam database atau browser storage. Browser menyimpan access/refresh token dengan namespace masing-masing portal, memperbarui sesi otomatis, dan memeriksa status akses ketika membuka kembali aplikasi.

Setelah dashboard berhasil dimuat, dialog menawarkan pemasangan ke layar utama. Browser yang mendukung `beforeinstallprompt` menampilkan tombol pemasangan; Safari/iPhone mendapat petunjuk Bagikan → Tambahkan ke Layar Utama. Pemasangan tetap memerlukan tindakan pengguna. Sesi tersimpan selama browser/OS tidak menghapus storage dan akses tidak dicabut. Clearing storage, logout, atau refresh token yang tidak berlaku lagi memerlukan QR kembali. Tidak ada jaminan penyimpanan permanen lintas browser/perangkat.

Admin dapat menonaktifkan QR dari daftar akses. Membership dan parent link dicabut; policy tambahan menolak akses tabel dari JWT lama. Keluar dari satu perangkat portal memakai logout lokal agar perangkat lain yang masuk melalui QR sama tidak ikut keluar. Pembuatan QR baru tidak otomatis mencabut QR sebelumnya; admin dapat menonaktifkannya secara eksplisit.

## Aktivasi database

Dua migrasi baru:

- `202609260014_portal_qr_sessions.sql`: provisioning transaksional, role portal, active/revoked check, scope kelas/siswa, daftar/context/revoke dan pencatatan kunjungan perpustakaan oleh pengguna PWA.
- `202609260015_parent_portal_timeline.sql`: koreksi kolom library dan guard sesi pada timeline/daftar anak.

Terapkan berurutan pada environment target setelah memastikan semua migrasi sebelumnya sudah ada. Jangan menjalankan seed/reset pada database sekolah yang berisi data. Migrasi gate lama diperbaiki pada SELECT INTO agar pemasangan dari database kosong bisa berjalan; database yang sudah menerapkan migrasi tersebut tidak otomatis menjalankannya ulang.

QR lama dari implementasi shadow-password sebelumnya perlu dibuat ulang. RPC `generate_shadow_access` lama tidak lagi boleh dieksekusi oleh anon/authenticated. Implementasi baru memakai akun Auth yang dibuat oleh API administratif resmi, kemudian menyelesaikan profile, membership, permissions, token dan relasi anak dalam satu RPC database. Jika RPC gagal, API mencoba menghapus akun Auth yang baru dibuat.

Backend membutuhkan `SUPABASE_SERVICE_ROLE_KEY` untuk membuat akun teknis dan memvalidasi token QR sebelum login. Key hanya berada di server. Kredensial internal QR diturunkan dengan HMAC key tersebut; bila service key diganti, terbitkan kembali QR. Secret frontend `VITE_*` tidak boleh berisi service key.

## URL dan development

| Portal | Script | Port lokal | Base path build |
| --- | --- | --- | --- |
| Admin | npm run dev:admin | 4173 | / |
| Parent | npm run dev:parent | 4174 | /parent/ |
| Waste | npm run dev:waste | 4175 | /waste/ |
| Extracurricular | npm run dev:extracurricular | 4176 | /extracurricular/ |
| Library | npm run dev:library | 4177 | /library/ |
| API | npm run dev | 3000 | /api/v1 |

Dev PWA mem-proxy `/api` ke port 3000. Jalankan portal tujuan sebelum mencoba QR. Untuk pemindaian dari HP, hostname `localhost` menunjuk HP itu sendiri: gunakan hostname/IP komputer yang dapat dijangkau atau URL staging. Development PWA bind ke 0.0.0.0; atur URL lengkap portal melalui env admin bila admin dibuka dari localhost.

Opsional pada build admin:

```dotenv
VITE_PARENT_URL=https://www.aksis.co.id/parent/
VITE_WASTE_URL=https://www.aksis.co.id/waste/
VITE_EXTRACURRICULAR_URL=https://www.aksis.co.id/extracurricular/
VITE_LIBRARY_URL=https://www.aksis.co.id/library/
```

Production: host masing-masing folder dist pada path tabel di atas, dengan fallback SPA ke index.html masing-masing; proxy `/api/` ke Express. Service worker dan manifest memakai scope portal masing-masing. Untuk hosting portal pada subdomain/root, set `VITE_BASE_PATH=/` saat build aplikasi itu dan set URL portal lengkap saat build admin. Gunakan HTTPS agar service worker/pemasangan bekerja pada smartphone. Service worker hanya didaftarkan pada build produksi.

## Kontrak API tambahan

| Method/path | Akses dan body |
| --- | --- |
| POST /auth/qr/generate | Bearer admin aktif; school_id, role_code, metadata. Role hanya WASTE_STAFF/LIBRARY_STAFF/TEACHER/PARENT. class_id wajib untuk Waste; student_id wajib untuk Parent. Mengembalikan id/token sekali. |
| POST /auth/qr/login | Publik; token hex 64 karakter dan role_code portal tujuan. Mengembalikan session dan portal context. |
| GET /auth/qr/context | Bearer sesi portal; memverifikasi sekolah/user/membership/token masih aktif. |
| GET /auth/qr?school_id=UUID | Bearer admin sekolah; metadata 200 QR terbaru, tanpa token mentah/hash. |
| DELETE /auth/qr/:id | Bearer admin sekolah; menonaktifkan QR dan membership/parent link. |
| POST /library/visits | Bearer + X-School-Id + library.visit; kontrak event seperti terminal library. Tidak membutuhkan Device credential. |
| GET /extracurriculars/:id/sessions | Bearer + X-School-Id + extracurricular.read. |

Semua path berawalan `/api/v1`. Perekaman perangkat fisik pada `/device/library/*` tetap terpisah. Request query tervalidasi sekarang dipasang sebagai property pada Express 5 sehingga default pagination dan coercion tetap tersedia saat handler membacanya.

## Verifikasi

- `npm test`: schema portal, sesi persisten, refresh serentak, pergantian sekolah, revoke, error jaringan, serta test sebelumnya.
- `npm run typecheck:portals`: API, admin, dan empat PWA.
- Build keenam aplikasi terkait.
- `DATABASE_URL=... npm run test:db:portals`: gunakan database disposable, test dibungkus transaksi rollback.

Audit implementasi lokal menggunakan PostgreSQL sementara dengan stub schema/roles Auth untuk menguji migrasi dan 20 assertion keamanan/fungsional. Suite memeriksa larangan provisioning lintas sekolah, role terbatas, scope kelas, scope anak, transaksi library idempotent, serta token expired/revoked. Ini tidak menggantikan uji Supabase Auth sebenarnya dan uji browser/smartphone.

UAT environment target: buat empat QR → buka melalui kamera → pastikan dashboard/tenant benar → pasang aplikasi → tutup browser → buka ikon → pastikan tidak diminta QR ulang → nonaktifkan QR dari admin → pastikan aplikasi menolak request berikutnya. Uji pula QR Waste terhadap kelas lain dan QR Parent terhadap anak lain.

Referensi perilaku browser: [MDN installation prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt) dan [Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Hasil pemeriksaan implementasi pada 26 September 2026: 88/88 test Vitest lulus; pemeriksaan TypeScript untuk API/admin/empat PWA lulus; keenam build lulus; 20/20 assertion PostgreSQL portal lulus dan transaksi fixture di-rollback. PostgreSQL sementara telah dihentikan setelah pengujian. Database Supabase yang terhubung ke aplikasi belum dimigrasi dalam pekerjaan lokal ini. Pemasangan aktual pada Android/iPhone belum diuji.
