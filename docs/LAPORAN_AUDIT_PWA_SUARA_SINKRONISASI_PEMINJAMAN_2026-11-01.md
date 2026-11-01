# Laporan audit PWA suara, sinkronisasi, dan peminjaman

Tanggal: 1 November 2026. Lingkup: PWA Piket Kehadiran, Piket Bank Sampah, Perpustakaan, dan Ekstrakurikuler.

## Temuan dan perubahan

1. **Suara Alami Manusia Asli (100% Native OS tanpa Fallback Robotik)**:
   - Sesuai evaluasi kualitas, mesin suara buatan (WASM/sanoTTS) yang bersuara kaku/bindeng dan berukuran berat (~8,5 MB) ditiadakan sepenuhnya.
   - Semua PWA kini 100% menggunakan suara resmi alami bawaan sistem operasi ponsel (**Google Bahasa Indonesia** di Android, **Apple Damayanti** di iOS/macOS) melalui Web Speech Synthesis on-device. Suara terdengar jernih, fasih, dan manusiawi dengan intonasi penutur asli Indonesia.
   - PWA menjadi jauh lebih ringan, cepat dipasang, dan hemat memori HP (aset PWA kembali ke ukuran minimal ~300 KB tanpa unduhan binary model besar).
   - Dilengkapi *debounce* 8 detik untuk mencegah penumpukan audio saat kartu siswa dipindai berulang kali.
2. **Solusi Perangkat Khusus Tanpa Paket Suara Indonesia**:
   - Jika HP Android/iOS tertentu belum mengunduh paket data suara Bahasa Indonesia di setelan sistemnya, sistem tidak memaksakan suara bahasa asing yang robotik.
   - PWA secara otomatis mendeteksi ketiadaan paket suara dan menampilkan indikator status `⚠️ Paket suara Bahasa Indonesia belum terpasang di HP ini` serta tombol `[⚙️ Pasang Suara]`.
   - Mengetuk tombol tersebut (atau tombol Uji Suara saat suara belum ada) akan memunculkan dialog panduan interaktif yang disesuaikan dengan OS:
     - **Android**: Tombol langsung membuka *Google Speech Services* di Google Play Store dan petunjuk 4 langkah mengaktifkan Bahasa Indonesia di Pengaturan HP (Aksesibilitas/Sistem).
     - **iOS**: Petunjuk langkah cepat mengunduh suara *Damayanti* (Kualitas Ditingkatkan) di Pengaturan iOS.
   - **Deteksi Realtime**: Event `speechSynthesis.onvoiceschanged` aktif memantau perubahan. Begitu pengguna selesai mengunduh suara di HP dan kembali ke PWA, sistem langsung mendeteksi dan mengaktifkan suara alami secara otomatis tanpa perlu memuat ulang (*reload*) atau menginstal ulang aplikasi.
3. **Pemisahan Data Siswa (Multitenancy Cache)**:
   - Cache siswa dipisah secara ketat menurut sekolah dan portal (`school_id:portal_id`).
   - Masa simpan data 7 hari, dan pembaharuan daftar siswa berjalan bertahap di latar belakang (*cursor-based pagination*) yang dibatasi hanya untuk sekolah dan kelas yang diizinkan.
4. **Antrean Transaksi Tahan Rusak (`DurableQueue`)**:
   - Menggantikan antrean penyimpanan lokal dengan IndexedDB (`aksis-pwa-events-v1`) per entri transaksi.
   - Mencegah benturan data (*race condition*) antar tab.
   - Transaksi yang ditolak server (4xx) dicatat status kegagalannya untuk diperiksa petugas dan tidak lagi mengunci/menghambat antrean transaksi berikutnya.
5. **Peminjaman Buku pada PWA Perpustakaan**:
   - Form peminjaman buku mencatat NISN/nomor siswa, judul buku, penulis, dan tanggal jatuh tempo.
   - Nomor siswa yang baru dipindai di tab Scan otomatis disalin ke form peminjaman.
   - Dilengkapi tab navigasi bawah (Scan vs Peminjaman) dan sinkronisasi idempoten berbasis `event_id` ke tabel `public.library_loans`.

## Hasil verifikasi

- **Unit Testing**: Seluruh 50 berkas pengujian dan 255 tes lulus (`npm test`).
- **Pemeriksaan Tipe Data**: `npm run typecheck:all` lulus tanpa kesalahan di seluruh 11 aplikasi.
- **Pengujian Browser Headless**:
  - `tooling/test-attendance-voice.mjs`: Pemindaian QR dan suara alami Google Bahasa Indonesia terverifikasi offline.
  - `tooling/test-library-loans-offline.mjs`: Peminjaman buku tersimpan offline di HP dan tersinkronisasi 1x saat kembali online.
  - `tooling/test-durable-pwa-queue.mjs`: 40 penulisan transaksi simultan dari 2 tab tetap tersimpan utuh dan terisolasi per sekolah.
- **Database & RLS**: Migrasi `202611010010_library_loans.sql` aktif dan terproteksi di Supabase produksi.
- **Vercel Production Build**: Berhasil memaketkan 10 frontend entrypoint (`npm run vercel-build`).
