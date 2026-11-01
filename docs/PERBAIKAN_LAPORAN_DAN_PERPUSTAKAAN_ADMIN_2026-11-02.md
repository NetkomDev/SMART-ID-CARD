# Catatan Perbaikan: Modul Laporan Wali Kelas & Perpustakaan Admin Sekolah

**Tanggal**: 2 November 2026  
**Ruang Lingkup**: Dashboard Admin Sekolah (`apps/admin-web`), Backend API (`apps/api`), Database Supabase

---

## 1. Masalah yang Diperbaiki

1. **Halaman Laporan Wali Kelas (`/reports`)**:
   - Terjadi kendala *"Terjadi kendala pada sistem. Mohon coba beberapa saat lagi atau hubungi admin sekolah."* saat admin membuka menu.
   - **Penyebab**: Fungsi RPC `report_classes` dan `report_class_students` dari migrasi pelaporan belum diterapkan ke database produksi Supabase. Selain itu, fungsi `report_period` sebelumnya melempar error fatal jika status tahun ajaran sekolah belum diset aktif (`is_active = false`).
   - **Solusi**:
     - Menerapkan RPC `report_classes` dan `report_class_students` ke database Supabase live.
     - Memperbaiki `report_period` dengan mekanisme fallback bertingkat: Tahun ajaran aktif -> Tahun ajaran terbaru yang terdaftar -> Tahun kalender berjalan.
     - Mengaktifkan status tahun ajaran `2026/2027` pada sekolah terkait.
     - Menyempurnakan format tanggal periode laporan di UI agar ditampilkan rapi dalam Bahasa Indonesia (misal: "1 Jul 2026 – 30 Jun 2027") serta menambahkan 4 Stat Card ringkasan (Total Siswa, Presensi Hadir, Bank Sampah, Kunjungan Perpus).

2. **Halaman Perpustakaan (`/library`)**:
   - Menu perpustakaan sebelumnya mengalami kendala function not found pada `report_library_summary` dan UI hanya menampilkan summary kunjungan kelas tanpa data sirkulasi buku.
   - Fungsi `list_portal_library_loans` sebelumnya membatasi akses hanya untuk role `LIBRARY_STAFF` sehingga `SCHOOL_ADMIN` ditolak dengan error `42501`.
   - **Solusi**:
     - Menerapkan RPC `report_library_summary` dan memperbarui `list_portal_library_loans` sehingga dapat diakses oleh admin sekolah dengan izin `library.read`.
     - Menambahkan endpoint `GET /api/v1/library/visits` di backend API untuk memuat riwayat log 50 tap kartu terbaru di perpustakaan.
     - Memperkaya UI Perpustakaan di `apps/admin-web/src/app.ts` dengan 3 Stat Card (Total Kunjungan, Buku Dipinjam, Kelas Teraktif), tabel Kunjungan Per Kelas, tabel Peminjaman Buku Aktif (dengan indikator status Jatuh Tempo/Dipinjam), dan tabel Riwayat Kunjungan Terbaru.

3. **Halaman Ekstrakurikuler (`/extracurricular`)**:
   - Tampilan modal Tambah Ekstrakurikuler sebelumnya kaku, input field bernuansa kusam `#f3f5f0` dengan outline kuning di dalam modal card putih, tombol submit hitam pekat yang berat, dan belum ada tombol batal.
   - Di halaman utama, hanya terdapat 2 stat card yang sempit di kiri, empty state belum interaktif, dan penambahan item baru saat data kosong terkendala karena ketiadaan tabel di DOM.
   - **Solusi**:
     - Memperbarui gaya modal `.admin-modal-card`, `.admin-modal-card-header`, `.admin-modal-form`, dan `.admin-modal-actions` di `apps/admin-web/src/styles.css`.
     - Memberikan background putih bersih pada input, border halus, focus ring biru modern (`rgba(37,99,235,0.18)`), badge preview kode otomatis uppercase, dan tombol aksi seimbang (Batal & Simpan dengan gradient biru khas Aksis).
     - Menjadikan layout halaman penuh dan seimbang dengan 4 Stat Card (*Total Ekstrakurikuler*, *Ekskul Aktif*, *Ekskul Nonaktif*, dan *Presensi Pembina*).
     - Menyediakan empty state interaktif dengan tombol call-to-action langsung di tengah card, serta re-render halaman otomatis setelah penambahan berhasil.

---

## 2. Hasil Pengujian

- `npm run typecheck:all`: **Lulus** (11 aplikasi/paket tervalidasi).
- `npm test`: **Lulus** (50 test suite, 256 tests lolos).
- `node tooling/test-admin-workspace.mjs`: **Lulus** (semua 11 menu dashboard admin lolos verifikasi navigasi & lifecycle).
- `npm run vercel-build`: **Lulus** (bundel frontend untuk seluruh aplikasi terkompilasi sukses).

---

## 3. Berkas yang Diubah

- `apps/api/src/routes/library.ts`: Menambahkan endpoint `GET /visits`.
- `apps/admin-web/src/app.ts`: Memperbarui `libraryPage()`, `reportsPage()`, dan `extracurricularPage()`.
- `apps/admin-web/src/styles.css`: Memperbarui styling `.admin-modal-*` agar form modal lebih modern dan profesional.
- `supabase/migrations/202611020001_reports_and_library_admin_fix.sql`: Berkas migrasi database untuk RPC pelaporan dan izin peminjaman buku admin.

