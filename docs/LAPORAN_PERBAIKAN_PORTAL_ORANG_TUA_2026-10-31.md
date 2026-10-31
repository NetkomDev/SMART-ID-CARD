# Laporan perbaikan pendaftaran PWA Portal Orang Tua

Tanggal: 31 Oktober 2026, WITA.

## Keputusan pemilik

- Satu QR sekolah untuk pendaftaran semua wali.
- Wali mengisi NISN dan tanggal lahir anak, nama lengkap, serta nomor WhatsApp.
- Tidak memerlukan email, password, atau OTP WhatsApp.
- Jika berganti HP, kehilangan sesi, atau keluar: masuk kembali menggunakan QR pribadi yang diterbitkan admin setelah memeriksa identitas wali.
- Deploy ke Vercel setelah perbaikan dan verifikasi.

## Temuan awal

1. Halaman admin menyebut pendaftaran QR dengan NISN/tanggal lahir, tetapi PWA menampilkan email/password dan API menolak login QR PARENT.
2. Identitas QR bersama yang lama dapat menampung beberapa hubungan anak. Identitas bersama tidak dapat dipakai sebagai akun keluarga yang terpisah.
3. URL QR sekolah dibersihkan oleh pengelola sesi sebelum dipakai untuk pendaftaran.
4. Nomor WA belum memiliki aturan normalisasi dan keunikan untuk identitas wali.
5. Admin belum memiliki alur QR pribadi untuk pemulihan akun wali.
6. Database produksi belum memiliki RPC keluarga individual, revokasi sesi, dan pembatasan percobaan yang diperlukan kode hasil hardening sebelumnya.
7. Konfigurasi deployment belum menetapkan backend rate limit database dan URL publik produksi; mode produksi perlu diaktifkan bersamaan dengan kesiapan database.

## Perbaikan yang diterapkan

| Bagian | Hasil |
| --- | --- |
| QR sekolah | Membuka formulir pendaftaran, tidak memberikan sesi bersama atau daftar anak. Token hanya berada dalam memori dan dihapus dari URL. |
| Formulir | NISN, tanggal lahir anak, nama lengkap wali, nomor WA; validasi, status proses, tombol dinonaktifkan selama permintaan, serta pesan kegagalan yang dapat dicoba kembali. |
| Pencocokan anak | Memakai kolom `nisn`, mempertahankan angka nol di depan, mencocokkan tanggal lahir dan sekolah QR; hanya anak dan sekolah aktif. Pemeriksaan diulang dalam transaksi SQL. |
| Identitas wali | Akun Auth unik untuk setiap wali. WA unik per sekolah setelah normalisasi `08…`, `628…`, atau `+628…` menjadi `+628…`. Tidak memakai akun Auth QR bersama. |
| Pendaftaran ulang | WA yang sudah terdaftar ditolak dengan petunjuk meminta QR pribadi. NISN/tanggal lahir tidak dapat dipakai untuk masuk ke akun WA yang sudah ada. Keunikan database menangani pendaftaran bersamaan. |
| Pembuatan akun | Identitas Auth internal dibuat server tanpa email/OTP kepada wali. Bila transaksi penautan gagal, akun Auth baru dikompensasi dengan penghapusan. |
| Sesi | Kredensial hanya dalam cookie terenkripsi HttpOnly; Secure pada Vercel, SameSite Strict, CSRF dan pemeriksaan Origin. JWT tidak dikirim ke JavaScript atau localStorage. |
| Pemulihan | QR acak pribadi, disimpan sebagai hash; 24 jam, sekali pakai, QR sebelumnya dicabut saat diterbitkan ulang. Saat dipakai, seluruh sesi Auth lama wali dicatat sebagai dicabut sebelum membuat sesi baru. |
| Admin | Tombol **Akses orang tua** pada siswa menampilkan wali yang tertaut dan membuat QR masuk ulang. Penerbitan dibatasi admin sekolah; QR hanya ditampilkan saat dibuat. |
| Anak tambahan | Tetap memakai kode undangan pribadi dari admin melalui menu **Hubungkan Anak** pada akun wali yang aktif. Admin dapat membuat kode dari dialog yang sama. |
| Pembatasan | Maksimal 10 permintaan pendaftaran/pemulihan per alamat IP selama 15 menit, disimpan di database dan berlaku lintas instance. Kunci rate limit di-HMAC; tidak menyimpan NISN, tanggal lahir, WA atau QR mentah. |
| Proxy Vercel | IP mengikuti header yang ditetapkan edge Vercel; di luar Vercel mengikuti konfigurasi trusted proxy Express. Rujukan: [Vercel request headers](https://vercel.com/docs/headers/request-headers). |

Nomor WA adalah ID yang diberikan wali, **bukan nomor yang sudah diverifikasi kepemilikannya**. Kecocokan NISN/tanggal lahir merupakan pemeriksaan data anak, bukan bukti legal hubungan keluarga. Ini mengikuti pilihan pendaftaran sederhana tanpa OTP; admin perlu menindaklanjuti hubungan yang dipermasalahkan. QR sekolah hanya mengendalikan pendaftaran baru; menonaktifkannya tidak otomatis mencabut akun wali individual yang sudah terbentuk.

## Database produksi

Proyek dicocokkan terhadap konfigurasi AKSIS sebelum perubahan. Cadangan privat profil, tujuh tautan lama, definisi fungsi dan kebijakan terkait disimpan di direktori lokal yang dikecualikan dari deployment. Tidak ada secret atau isi cadangan di laporan ini.

Enam migrasi diterapkan sebagai satu transaksi setelah simulasi transaksi yang di-rollback berhasil:

1. `202610300001_family_access_hardening`
2. `202610300002_verified_parent_dashboard`
3. `202610300003_parent_permits`
4. `202610300006_distributed_limits`
5. `202610300010_parent_session_revocation`
6. `202610310001_parent_qr_onboarding`

Riwayat migrasi Supabase ikut dicatat. **Tujuh tautan legacy dinonaktifkan dengan riwayat tetap tersimpan (`LEGACY_REVERIFY`). Wali lama perlu mendaftar kembali lewat QR sekolah.** Tidak ada data siswa yang dihapus untuk perpindahan alur ini. Migrasi hardening yang tidak diperlukan untuk portal tidak dijalankan dalam pekerjaan ini.

Konfigurasi Vercel production diperbarui: `NODE_ENV=production`, `RATE_LIMIT_BACKEND=database`, `PUBLIC_APP_URL=https://www.aksis.co.id`.

## Verifikasi

- `npm run verify`: pemeriksaan tipe seluruh aplikasi, **192 pengujian pada 39 berkas**, dan build API serta sembilan aplikasi lulus.
- Pengujian terarah autentikasi: **23 pengujian** lulus, mencakup input, isolasi WA, kompensasi akun, pembatasan, pemulihan, enkripsi cookie, Origin dan CSRF.
- PostgreSQL 17 lokal: seluruh migrasi serta suite pendaftaran/pemulihan baru dan regresi dashboard orang tua lulus.
- Uji SQL membuktikan pembatasan RPC service-role, isolasi anak/sekolah, penolakan DOB salah/WA duplikat, rotasi QR, sekali pakai, pencabutan sesi lama dan akses sesi baru.
- Browser Chrome: formulir tanpa email/password, QR sekolah, kesalahan dan coba ulang, masuk, pemulihan sesi, keluar dan QR pribadi setelah keluar lulus; tidak ada overflow horizontal pada lebar 320, 390, 768 piksel.
- Bukti browser dan metadata database: `docs/analysis/2026-10-31/parent-portal/`.

## Cara pakai

1. Admin membuka **Portal PWA & QR → Portal Orang Tua**, lalu membagikan QR sekolah.
2. Wali memindai QR, mengisi data anak dan identitasnya, lalu memilih **Daftar dan masuk**.
3. Setelah berhasil, wali dapat menyimpan PWA ke layar utama dan membuka kembali selama sesi masih berlaku.
4. Untuk HP baru/sesi berakhir: admin membuka data siswa → **Akses orang tua** → memilih wali → **Buat QR masuk ulang**. Wali memindainya dalam 24 jam. Sesi lama dicabut ketika QR dipakai.
5. Untuk anak tambahan, admin membuat kode penautan anak dan wali menggunakannya di **Hubungkan Anak**.

## Deployment dan uji produksi

- Status **READY**, 31 Oktober 2026 pukul **08.57 WITA**.
- Produksi: **https://www.aksis.co.id/parent/**.
- Deployment: `dpl_D9wXcA1mRHX5dJWhiccS1hn6oq2R`.
- URL immutable: https://aksis-icr3dvz2l-netkom-developers-projects.vercel.app.
- Inspector: https://vercel.com/netkom-developers-projects/aksis/D9wXcA1mRHX5dJWhiccS1hn6oq2R.
- Pemeriksaan umum: sembilan halaman aplikasi, API health, penolakan akses tanpa autentikasi, dan aset frontend terbaru **PASS**. Perbaikan Command Center sebelumnya ikut termuat dan marker asetnya terverifikasi.
- **13 pemeriksaan alur produksi PASS**, meliputi PWA, pendaftaran nyata, isolasi anak, pembatasan identitas WA, pengelolaan wali oleh admin, rotasi dan sekali pakai QR pemulihan, pencabutan sesi HP lama serta logout. Rincian pada `production-flow.json`.
- Sekolah, siswa, akun Auth, hubungan wali dan token pemulihan uji dibuat khusus sementara; seluruhnya dibersihkan. Pemeriksaan akhir membuktikan tidak ada sekolah/wali/token/akun Auth QA tersisa. Data sekolah sebenarnya tidak dipakai sebagai fixture.
- Manifest upload diperiksa: berkas `.env`, token akses, cadangan privat, direktori editor dan dokumen tidak diunggah.

Bukti: `deployment.json`, `production-smoke.json`, `production-flow.json`, `cleanup.json`, dan `validation-summary.json` pada direktori bukti. Skrip reproduksi: `tooling/test-parent-onboarding.mjs` dan `tooling/verify-parent-production.mjs`. Skrip produksi memerlukan kredensial lokal privat; jangan menjalankannya dengan secret dalam log.

Deployment CLI membawa sumber lokal yang diverifikasi; sumber belum di-push ke GitHub dalam pekerjaan ini. Uji browser menggunakan Chrome desktop dengan emulasi ukuran layar; pemasangan aktual di Safari/iOS/Android fisik belum diverifikasi.
