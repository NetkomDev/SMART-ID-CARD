# Laporan Perbaikan dan Audit IAM & Hak Akses Super Admin

Tanggal: 31 Oktober 2026, WITA.

## Sasaran Pekerjaan

Berdasarkan permintaan pemilik:
1. **Fitur Filter Sekolah pada Halaman "IAM & Hak Akses"**: Super Admin dapat melihat dan memfilter pengguna hak akses berdasarkan sekolah tertentu secara cepat.
2. **Audit Tombol Tindakan "Active/Nonactive" & "Hapus"**: Memastikan tindakan tombol berfungsi nyata hingga ke level backend dan database Supabase, bukan hanya terjadi di sisi UI (*optimistic*).
3. **Modal Popup Peringatan/Konfirmasi**: Menampilkan dialog peringatan/konfirmasi yang jelas dan elegan sebelum tindakan penonaktifan, pengaktifan, maupun penghapusan hak akses dieksekusi ke sistem.
4. **Proteksi Penonaktifan & Penghapusan Role Portal (Login < 3 Bulan)**: Hak akses dengan peran Portal (`WASTE_STAFF`, `TEACHER`, `PARENT`, `LIBRARY_STAFF`) tidak dapat dinonaktifkan atau dihapus jika terdeteksi masih pernah login dalam 3 bulan terakhir. Penonaktifan/penghapusan baru diizinkan jika sudah tidak pernah login lebih dari 3 bulan.

---

## Temuan Audit Awal

1. **Tombol "Hapus" Belum Terhubung ke Backend**:
   - Di sisi UI admin web, tombol hapus memanggil `api('/platform/iam/' + id, { method: 'DELETE' })`.
   - Namun di `apps/api/src/routes/platform.ts`, rute `DELETE /iam/:id` sama sekali belum dibuat, sehingga setiap tindakan hapus menghasilkan error HTTP 404 (Not Found).
2. **Inkonsistensi Kode Role pada Tombol "Active/Nonactive"**:
   - Akun portal di database menggunakan kode role seperti `PORTAL_TEACHER`, `PORTAL_WASTE_STAFF`, `PORTAL_LIBRARY_STAFF`.
   - Namun validasi Zod backend dan fungsi database RPC `platform_update_membership` hanya menerima array tanpa prefix `PORTAL_`, menyebabkan request toggle status gagal dengan error 422 (Validation Error) atau exception database.
3. **Filter Sekolah Belum Tersedia**:
   - Fungsi RPC database `platform_get_iam` hanya menerima `p_limit` dan `p_offset` tanpa parameter `p_school_id`, sehingga Super Admin hanya bisa melihat daftar seluruh sekolah sekaligus tanpa opsi penyaringan per sekolah.
4. **Konfirmasi Masih Native & Belum Ada Proteksi 3 Bulan**:
   - Tombol hapus hanya memakai dialog native `confirm()`, sedangkan tombol Active/Nonactive langsung mengeksekusi tanpa konfirmasi sama sekali.
   - Belum ada batasan waktu keaktifan login untuk melindungi akun portal yang masih aktif beroperasi di sekolah.

---

## Solusi & Perbaikan yang Diterapkan

### 1. Migrasi Database Supabase (`202610310002_platform_iam_filter_and_portal_protection.sql`)
- **Fungsi `platform_get_iam(p_limit int, p_offset int, p_school_id uuid DEFAULT NULL)`**:
  - Menambahkan parameter `p_school_id` opsional. Jika diberikan, data dan total count difilter khusus untuk sekolah tersebut.
- **Fungsi `platform_update_membership(p_id uuid, p_status public.membership_status, p_roles text[])`**:
  - Mendukung role dengan prefix `PORTAL_` (`PORTAL_TEACHER`, `PORTAL_WASTE_STAFF`, `PORTAL_LIBRARY_STAFF`, `PORTAL_PARENT`).
  - **Aturan Proteksi 3 Bulan**: Jika status diubah dari `ACTIVE` menjadi `SUSPENDED` atau `REVOKED`, sistem mengecek apakah pengguna memiliki peran Portal dan tanggal `last_sign_in_at`. Jika terdeteksi login dalam 3 bulan terakhir (`> now() - interval '3 months'`), mutasi dibatalkan dengan exception `PORTAL_ACTIVE_RECENTLY`.
- **Fungsi `platform_delete_school_user(p_id uuid)`**:
  - Mengecek keberadaan akun dan peran Portal.
  - **Aturan Proteksi 3 Bulan**: Jika peran Portal dan login dalam 3 bulan terakhir, penghapusan ditolak dengan exception `PORTAL_ACTIVE_RECENTLY`.
  - Jika memenuhi syarat (login > 3 bulan atau bukan portal), status diubah ke `REVOKED`, `deleted_at = now()`, token QR di `qr_access_tokens` dicabut, dan dicatat dalam `audit_logs`.

### 2. Backend API Express (`apps/api/src/routes/platform.ts` & `errors.ts`)
- **`GET /api/v1/platform/iam`**: Mendukung query parameter `school_id` opsional dan meneruskannya ke RPC `platform_get_iam`.
- **`PATCH /api/v1/platform/iam/:id`**: Memperluas enum validasi role Zod agar menerima semua role portal. Menangani error `PORTAL_ACTIVE_RECENTLY` menjadi HTTP 409 Conflict dengan pesan ramah pengguna.
- **`DELETE /api/v1/platform/iam/:id`**: Mengimplementasikan endpoint penghapusan hak akses yang memanggil RPC `platform_delete_school_user` secara aman dengan penanganan status 200 / 409.

### 3. Frontend Dashboard Super Admin (`apps/admin-web/src/platform/pages.ts`)
- **Toolbar Filter Sekolah**:
  - Ditambahkan dropdown pilihan sekolah di atas tabel IAM: *"Semua Sekolah (Lintas Sekolah)"* dan daftar seluruh sekolah aktif.
  - Memilih sekolah langsung menyaring tabel secara instan tanpa perlu reload halaman.
- **Modal Konfirmasi & Peringatan**:
  - Menggantikan native dialog dengan `confirmModal` (HTML5 accessible dialog, backdrop blur, fokus keyboard aman).
  - **Pencegahan di Sisi UI**: Sebelum request dikirim, UI memeriksa apakah user adalah akun Portal dan apakah `last_sign_in_at` kurang dari 90 hari.
  - Jika pengguna aktif dalam 3 bulan terakhir: Muncul dialog peringatan penolakan *"Tindakan Ditolak: Akses Portal Masih Aktif"* dengan informasi tanggal terakhir login dan alasan keamanan.
  - Jika boleh dilakukan: Muncul dialog konfirmasi aksi:
    - Nonaktifkan: dialog peringatan (kuning) dengan konfirmasi *"Nonaktifkan Akses"*.
    - Aktifkan: dialog info (biru) dengan konfirmasi *"Aktifkan Akses"*.
    - Hapus: dialog bahaya (merah) dengan peringatan pembatalan permanen dan konfirmasi *"Ya, Hapus Akses"*.

---

## Verifikasi & Pengujian

1. **Unit & Integration Tests**:
   - `apps/api/src/routes/platform-iam.test.ts`: 6 pengujian lulus 100% (filter sekolah, update status, delete, dan pencegahan 3 bulan).
   - Seluruh test suite monorepo (`npm test`): 43 test files lulus (**213 passed**).
2. **Live Database Integration (`tooling/test-platform-iam.mjs`)**:
   - Menguji langsung ke database Supabase produksi `mzurocuwgoqwooilxuvv` dengan akun Super Admin.
   - Hasil:
     - `platform_get_iam` lintas sekolah dan filter per sekolah: **PASS**
     - Proteksi penonaktifan portal login hari ini: **PASS (Blocked with PORTAL_ACTIVE_RECENTLY)**
     - Penonaktifan portal idle 4 bulan lalu: **PASS (Status changed to SUSPENDED)**
     - Proteksi penghapusan portal login hari ini: **PASS (Blocked with PORTAL_ACTIVE_RECENTLY)**
     - Penghapusan portal idle 4 bulan lalu: **PASS (Marked REVOKED with deleted_at timestamp)**
3. **Multi-App Typecheck & Build**:
   - `npm run typecheck:all`: 10/10 aplikasi valid.
   - `npm run build:all` & `npm run vercel-build`: Sukses mengompilasi dan mengemas sembilan frontend entrypoints.

---

## Status Deployment Produksi

- **Vercel Inspect**: `https://vercel.com/netkom-developers-projects/aksis/EA8qSMqd4J9EHBjip8WsvrAEhuiA`
- **Vercel Production Target**: `https://aksis-7lr58ppua-netkom-developers-projects.vercel.app`
- **Aliased Domain**: `https://www.aksis.co.id`
- **Status Endpoint Produksi**: `PASS: 9 entrypoints, API health, authentication boundary, and production assets verified at https://www.aksis.co.id` (HTTP/2 200).
