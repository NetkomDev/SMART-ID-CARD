# Dokumentasi Perubahan & Transformasi Sistem Presensi Kehadiran AKSIS
**Tanggal Implementasi**: 31 Oktober 2026  
**Status**: Produksi (Verified & Deployed)  
**Lingkup Perubahan**: Database Supabase, API Backend, PWA Guru Piket (`attendance-pwa`), Admin Web, Portal Orang Tua Siswa, dan Ekosistem Sinkronisasi.

---

## 1. Latar Belakang & Tujuan
Sebelumnya, sistem presensi kehadiran siswa mengandalkan perangkat gerbang fisik RFID (*RFID Gate tap*). Sistem ini mengalami keterbatasan:
1. Antrean panjang di gerbang sekolah pada jam kedatangan puncak.
2. Siswa berpotensi menitipkan kartu kepada temannya jika tidak disaksikan guru/petugas secara langsung.
3. Ketergantungan penuh terhadap koneksi jaringan online di gerbang IoT.

**Solusi Baru**: Presensi kehadiran dan kepulangan dialihkan ke pemindaian QR Code ID Card menggunakan **smartphone oleh guru piket dan satpam sekolah** (*Multi-scanner smartphone system*).

---

## 2. Fitur & Arsitektur Utama

### A. Multi-Scanner Tanpa Batas (Bisa 1, 2, hingga 10+ Guru Sekaligus)
- Tidak ada batasan jumlah guru piket atau satpam yang memindai secara simultan.
- Setiap petugas membuka portal PWA Piket Kehadiran (`/attendance/`) menggunakan QR akses instan tanpa username/password (`role: GATE_STAFF`).
- Identitas nama guru piket (`scanner_name`) dapat disetel pada perangkat dan otomatis melekat pada setiap log presensi.

### B. Deteksi Anti-Duplikasi (*Local & Server-Side Anti-Duplicate*)
- **Deteksi Cepat di HP**: Sistem langsung memeriksa riwayat lokal pada perangkat. Jika siswa telah dipindai untuk arah yang sama (Masuk/Pulang) pada hari yang bersangkutan, scanner segera memberikan audio tone khusus dan memunculkan banner notifikasi:
  > *"Kehadiran Sudah Tercatat: Siswa (Nama) sudah tercatat masuk hari ini pukul 07.12."*
- **Validasi Tingkat Database**: Supabase RPC `sync_pwa_attendance_batch` dan `ingest_pwa_attendance_scan` memvalidasi keberadaan log arah yang sama pada tanggal lokal yang sama (`occurred_at_local::date`).

### C. Pemindaian Cepat Offline & Sinkronisasi Senyap (*Silent Background Sync*)
- Proses pemindaian di kamera berlangsung **instan (<100ms)** tanpa loading spinner yang membekukan antarmuka (UI).
- Data pemindaian langsung dicatat ke penyimpanan antrean offline lokal (`aksis_attendance_queue_v1`) dan riwayat lokal.
- Ketika HP terhubung kembali ke internet (`window.online` atau interval berkala 15 detik), sistem mengirim data ke endpoint `/api/v1/attendance/pwa-sync` secara diam-diam di latar belakang (*silent sync*).
- Jika koneksi terputus saat proses sinkronisasi, antrean tetap aman di perangkat dan akan dicoba kembali saat koneksi pulih.

### D. Rekonsiliasi Multi-Device: Data Terdahulu Dianggap Sah (*Earliest Timestamp Wins*)
Contoh Kasus:
- Guru A memindai QR siswa A pada pukul **07.30** (dalam kondisi offline).
- Guru B memindai QR siswa A pada pukul **07.35** (dalam kondisi offline).
- Guru B lebih dulu tersambung ke internet dan menyinkronkan data pukul 07.40.
- Guru A baru tersambung ke internet pada pukul 07.45.
- **Hasil di Database**: Logika RPC PostgreSQL `sync_pwa_attendance_batch` menggunakan `pg_advisory_xact_lock` dan membandingkan `occurred_at_local`. Ketika kiriman Guru A (07.30) tiba, sistem **memperbarui (meng-update)** data menjadi waktu Guru A karena waktu pemindaian nyatanya lebih awal daripada Guru B. Dengan demikian, data yang sah adalah data yang diambil paling duluan (**07.30**).

### E. Jam Pelajaran & Jam Presensi (Admin Dashboard)
Pada menu **Kehadiran** di Dashboard Admin Sekolah (`apps/admin-web`), admin dapat menetapkan:
1. **Jam Datang (Mulai - Sampai)**: misal 06:30 - 07:30.
   - Bila pemindaian masuk melewati jam "Sampai", sistem otomatis menandai siswa **Terlambat**.
   - Pada PWA Guru Piket muncul popup dialog **"Siswa Terlambat"** disertai pilihan cepat alasan (*quick chips*): *"Ban Bocor"*, *"Macet Lalu Lintas"*, *"Bangun Kesiangan"*, *"Hujan Lebat"*, *"Urusan Keluarga"*, dan kolom input keterangan bebas.
2. **Jam Pulang Resmi**: misal 14:00.
   - Bila siswa minta dipindai pulang sebelum jam kepulangan resmi, sistem menandai **Pulang Cepat**.
   - Pada PWA Guru Piket muncul popup dialog **"Pulang Lebih Cepat"** dengan pilihan cepat alasan: *"Sakit (Pulang Cepat)"*, *"Izin Acara Keluarga"*, *"Dispensasi Lomba / Tugas"*, *"Keperluan Mendesak"*, dan input keterangan bebas.
   - Guru mengonfirmasi alasan dengan menekan tombol simpan aksi.

### F. Integrasi Menyeluruh (Database, Command Center, Portal Orang Tua)
- **Database & Command Center**: Data tersinkronisasi secara real-time ke log kehadiran, ringkasan kehadiran hari ini, dan layar monitoring Command Center.
- **Portal Orang Tua Siswa (`apps/parent-pwa`)**:
  - Pada kartu **"Kehadiran Hari Ini"**, ditampilkan keterangan kecil di bagian bawah:
    - `"Hari ini Terlambat (Alasan: Ban Bocor)"`
    - `"Hari ini Pulang Cepat (Alasan: Sakit)"`
  - Orang tua mengetahui status kehadiran anak secara transparan dan akurat.

---

## 3. Komponen Teknis yang Diubah / Ditambahkan

1. **Database Supabase (`mzurocuwgoqwooilxuvv`)**:
   - Migration `202610310005_gate_attendance_pwa_offline_sync.sql`.
   - Modifikasi tabel `attendance_logs`: kolom `device_id` & `card_id` nullable (mendukung input smartphone), penambahan kolom `notes`, `is_early_departure`, dan `scanner_name`.
   - Tabel `school_attendance_rules` untuk konfigurasi jam masuk/pulang per sekolah.
   - Penambahan role `GATE_STAFF` pada fungsi `provision_portal_access`.
   - Stored Procedure `ingest_pwa_attendance_scan` & `sync_pwa_attendance_batch` dengan *earliest timestamp resolution*.
   - Pembaruan RPC `get_verified_parent_child_today` (v3) menyertakan `note`, `is_late`, dan `is_early_departure`.

2. **Backend API (`apps/api`)**:
   - `apps/api/src/schemas/portal.ts`: Penambahan `GATE_STAFF` ke `portalRoles`.
   - `apps/api/src/schemas/attendance.ts`: Skema validasi aturan jam dan payload sinkronisasi batch.
   - `apps/api/src/routes/attendance.ts`: Endpoint `GET /rules`, `PUT /rules`, `POST /pwa-scan`, `POST /pwa-sync`.

3. **PWA Guru Piket (`apps/attendance-pwa`)**:
   - Aplikasi baru berbasis Vite & TypeScript di `/attendance/`.
   - Kamera QR real-time dengan zoom controls & flip camera (`QRCamera`).
   - Mode otomatis (Datang di pagi hari, Pulang di siang/sore hari) + tombol toggle manual.
   - Antrean IndexedDB/LocalStorage untuk pemindaian offline instan.
   - Audio beep sintetis Web Audio API (success, warning, duplicate, error).
   - Dialog popup terlambat & pulang cepat dengan quick chips dan input alasan.

4. **Admin Dashboard (`apps/admin-web`)**:
   - Halaman `/attendance`: Formulir Pengaturan Jam Pelajaran (Mulai, Sampai, Jam Pulang), metrik jam presensi, kolom status presensi detail dengan alasan dan nama petugas piket.
   - Halaman "Portal PWA & QR": Kartu portal baru **"Piket Kehadiran"** (`GATE_STAFF`) untuk mencetak QR akses guru piket & satpam.

5. **Portal Orang Tua (`apps/parent-pwa`)**:
   - Tipe `attendance.note`, `is_late`, `is_early_departure` di `ParentTodayData`.
   - Render badge keterangan dinamis di bagian bawah Card Kehadiran Hari Ini.

6. **Tooling & Routing**:
   - `package.json`: Skrip `dev:attendance` dan `build:attendance`.
   - `tooling/verify-apps.mjs`: Pendaftaran `attendance-pwa` dalam verifikasi lint/build.
   - `tooling/package-sites.mjs`: Pemaketan 10 frontend entrypoints ke direktori `dist/attendance/`.
   - `vercel.json`: Konfigurasi rewrite `/attendance/(.*)` -> `/attendance/index.html`.

---

## 4. Hasil Pengujian
- `npm run typecheck:all`: **Lulus 100%** (11 aplikasi frontend & backend).
- `npm test`: **Lulus 100%** (45 file pengujian, 231 unit tests lulus).
- `npm run vercel-build`: **Lulus 100%** (Seluruh 10 aplikasi frontend berhasil di-build dan dipaketkan).
