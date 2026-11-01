# LAPORAN PENERAPAN PEMBACA QR BERSUARA, DATA OFFLINE & SINKRONISASI LATAR BELAKANG PWA
Tanggal: 01 November 2026
Lokasi: `apps/library-terminal`, `apps/extracurricular-pwa`, `apps/waste-pwa`, `apps/shared/natural-voice.ts`, `apps/shared/offline-store.ts`

---

## 1. Analisis Mekanisme Data Offline & Background Sync PWA Presensi

Pada PWA Presensi (`apps/attendance-pwa`), proses scan QR dapat terlaksana secara instan (< 50 milidetik) dan antrean fisik di gerbang sekolah dapat ditekan hingga nol melalui arsitektur berikut:

### A. Pemisahan Total Antara Antarmuka Fisik dan Jaringan Internet
- **Penyelesaian Siswa On-Device**: Data siswa di-cache di penyimpanan lokal perangkat (IndexedDB/`localStorage`). Saat barcode atau QR dipindai, pencocokan identitas (`resolveStudent`) dijalankan langsung di memori perangkat tanpa melakukan HTTP request ke server.
- **Optimistic Local Queue**: Begitu data valid, transaksi langsung disimpan ke antrean lokal berstatus `PENDING` dengan pengidentifikasi unik (`crypto.randomUUID()`).
- **Feedback Seketika**: Suara nama siswa dilafalkan secara alami (`speaker.speak(...)`) dan indikator sukses muncul dalam hitungan milidetik. Operator dan siswa tidak perlu menunggu sinyal internet atau memencet tombol konfirmasi.
- **Perputaran Cepat Antrean**: Kamera diatur tetap aktif (`once: false`) dan banner sukses menutup otomatis dalam 1,8 detik sehingga siswa berikutnya dapat langsung memindai kartunya.

### B. Sinkronisasi Diam-diam di Latar Belakang (*Silent Background Sync*)
- **Non-blocking Execution**: Fungsi `sync()` dipanggil tanpa `await` (`void sync()`), sehingga UI dan scanner tidak pernah dibekukan oleh *network spinner* atau dialog error.
- **Heartbeat & Event Triggers**: Sinkronisasi berjalan secara otomatis melalui:
  1. Segera setelah scan baru masuk ke antrean lokal.
  2. Interval periodik di latar belakang (setiap 8.500 ms).
  3. Saat perangkat kembali terhubung ke internet (`window.addEventListener("online")`).
  4. Saat aplikasi dibuka kembali setelah layar mati/pindah tab (`visibilitychange`).
- **Idempoten & Tahan Gangguan**: Backend mengenali `event_id` unik dari setiap scan. Jika terjadi koneksi putus-nyambung atau pengiriman ulang, data tidak akan ganda di server Supabase. Jika internet padam total, antrean tetap aman di perangkat dan tersinkronisasi otomatis begitu koneksi pulih.

---

## 2. Modul Bersama: `apps/shared/offline-store.ts`

Untuk menerapkan arsitektur yang sama ke seluruh portal PWA, dibangun modul bersama:
1. **`StudentCache`**:
   - Menyimpan cache siswa sekolah di `localStorage` per sekolah (`aksis_student_cache_${schoolId}`).
   - Mendukung pencocokan instan berdasarkan UUID siswa, NISN, nomor siswa (NIS), serta kode QR/UID kartu ID Card.
2. **`OfflineQueue<T>`**:
   - Mengelola antrean transaksi lokal dengan atribut `event_id`, `status: "PENDING" | "SYNCED" | "FAILED"`, dan timestamp kejadian.
   - Menyediakan metode `enqueue()`, `getPending()`, `markSynced()`, dan `markFailed()`.
3. **`BackgroundSyncCoordinator<T>`**:
   - Mengkoordinasikan siklus pengiriman batch ke backend API secara diam-diam tanpa mengganggu antarmuka scanner.

---

## 3. Penerapan pada Tiga PWA Layanan

### A. PWA Perpustakaan (`apps/library-terminal`)
- **Penyelesaian Instan**: Kartu/QR yang dipindai langsung dicocokkan dengan `StudentCache`.
- **Fast-Path Kunjungan**: Kunjungan langsung disimpan ke `aksis.library.terminal.queue`, suara `"Selamat datang, {nama}"` diucapkan seketika, dan kamera siap kembali dalam 1,8 detik.
- **Silent Sync**: Fungsi `sync()` mengirimkan antrean kunjungan ke `/library/visits` di latar belakang setiap 8,5 detik atau saat kembali online. Jika ada kunjungan baru saat offline, antrean bertambah tanpa memunculkan overlay kesalahan yang menghentikan barisan.

### B. PWA Ekstrakurikuler (`apps/extracurricular-pwa`)
- **Pre-Caching Anggota**: Saat pembina memilih kegiatan ekskul, daftar anggota kegiatan langsung disinkronkan ke `StudentCache` di latar belakang.
- **Fast-Path Presensi**: Siswa yang memindai QR langsung dikenali namanya, disuarakan `"{nama}, hadir"`, dan dicatat ke `attendanceQueue` berstatus `PENDING`.
- **Silent Sync**: Fungsi `syncAttendanceQueue()` mengirim presensi ke `/extracurriculars/:id/sessions/:sessionId/attendance` secara berkala tanpa memblokir input atau scanner kamera.

### C. PWA Piket Bank Sampah (`apps/waste-pwa`)
- **Penghapusan Loading Overlay pada Resolusi Siswa**: `resolveStudent` memeriksa `StudentCache` terlebih dahulu. Siswa langsung terdeteksi seketika tanpa *full-screen loading spinner*.
- **Offline Waste Queue**: Saat timbangan sampah disimpan, transaksi langsung dimasukkan ke `wasteQueue`, suara `"Setoran berhasil disimpan"` dilafalkan, dan aplikasi langsung beralih ke layar sukses.
- **Silent Sync**: Transaksi setoran dikirimkan ke `/waste/transactions` secara asinkron di latar belakang dengan interval 8,5 detik dan deteksi event online.

---

## 4. Hasil Pengujian & Verifikasi

1. **Unit Testing**:
   - `apps/shared/offline-store.test.ts`: Lulus pengujian penyimpanan cache siswa dan antrean offline.
   - `apps/shared/natural-voice.test.ts`: Lulus pengujian engine suara alami.
   - Seluruh test suite monorepo: **50 file tes, 252 tes lulus (100% pass)**.
2. **Typecheck Monorepo**:
   - `npm run typecheck:all`: 11 aplikasi monorepo lulus tanpa kesalahan TypeScript.
3. **Production Build**:
   - `npm run vercel-build`: Berhasil memaketkan seluruh bundle produksi dan mengemas 10 entrypoint portal.

---

## 5. Bukti Deployment Produksi

- **Platform Target**: Vercel (`netkom-developers-projects/aksis`)
- **Domain Produksi**: `https://www.aksis.co.id`
- **Deployment URL**: `https://aksis-m3f42ynnf-netkom-developers-projects.vercel.app`
- **Hasil Verifikasi Endpoint**:
  - `https://www.aksis.co.id/library/` -> HTTP 200 OK (Instant Scan & Offline Sync aktif)
  - `https://www.aksis.co.id/extracurricular/` -> HTTP 200 OK (Instant Scan & Offline Sync aktif)
  - `https://www.aksis.co.id/waste/` -> HTTP 200 OK (Instant Scan & Offline Sync aktif)
  - `https://www.aksis.co.id/attendance/` -> HTTP 200 OK (Berjalan normal)
