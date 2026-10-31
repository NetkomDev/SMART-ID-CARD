# Laporan Sinkronisasi Akses Portal & Indikator Warna IAM Super Admin

**Tanggal:** 31 Oktober 2026  
**Target Lingkungan:** Produksi AKSIS (Supabase & Vercel `www.aksis.co.id`)  
**Penanggung Jawab:** Antigravity AI Assistant

---

## 1. Ringkasan Eksekutif

Audit dan perbaikan telah diselesaikan untuk mengatasi ketidaksinkronan data hak akses portal antara **Dashboard Admin Sekolah** (`/pwa-portals`) dan **Dashboard Super Admin** (`/platform-iam`), serta menerapkan sistem **indikator visual berbasis warna (4 Tier)** untuk login portal dalam 1 bulan, 2 bulan, dan 3 bulan terakhir.

---

## 2. Analisis Akar Masalah (Root Cause)

1. **Penyebab Ketidaksinkronan Data:**
   - Admin Sekolah mengelola portal berbasis tabel `qr_access_tokens`. Ketika Admin Sekolah menekan tombol **"Hapus"** pada portal (`DELETE /api/v1/auth/qr/:id/hard`), token QR dihapus dari `qr_access_tokens`, namun baris pada `school_users` tidak ditandai `deleted_at = now()`.
   - Halaman **IAM & Hak Akses Super Admin** mengambil data dari `platform_get_iam` yang mengecek `school_users WHERE deleted_at IS NULL`. Akibatnya, 9 akun portal yang telah dihapus oleh Admin Sekolah (seperti di SMA Negeri 3 Watampone) masih tetap muncul di tabel Super Admin dengan status `ACTIVE` atau `NON ACTIVE`.

2. **Perbaikan Dua Arah (Two-Way Synchronization):**
   - **Backend API (`apps/api/src/routes/portal-auth.ts`):** Endpoint `DELETE /api/v1/auth/qr/:id/hard` kini memperbarui `school_users` dan `users` dengan `status = 'REVOKED'` serta `deleted_at = now()`, mencabut role, dan membersihkan credential.
   - **Database RPC (`platform_get_iam`):** Ditambahkan filter keamanan agar akun dengan peran Portal wajib memiliki relasi aktif di `qr_access_tokens` (`AND (NOT portal OR EXISTS (SELECT 1 FROM qr_access_tokens ...))`).
   - **Database RPC (`platform_delete_school_user`):** Ketika Super Admin menghapus akun portal, token terkait di `qr_access_tokens` otomatis dihapus agar tampilan Admin Sekolah juga langsung sinkron.
   - **Pembersihan Database:** Sebanyak 9 data akun portal yatim (orphaned) di database produksi telah dibersihkan secara aman dengan menandai `deleted_at = now()`.

---

## 3. Sistem Indikator Warna Masa Aktif Login Portal

Pada halaman `apps/admin-web/src/platform/pages.ts` dan `apps/admin-web/src/platform/platform.css`, diterapkan penanda warna dan status bertingkat (Tiering System) untuk peran Portal (`WASTE_STAFF`, `TEACHER`, `PARENT`, `LIBRARY_STAFF`):

| Tingkat (Tier) | Kriteria Login Terakhir | Indikator Garis Baris | Badge & Penanda | Status Kebijakan Keamanan |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Merah)** | Aktif dalam **< 1 bulan** (≤ 30 hari) | Border kiri **Merah** (`#ef4444`) & latar semu | 🔴 `< 1 Bulan · Terkunci (X hr lalu)` | **Terkunci:** Tidak dapat dihapus atau dinonaktifkan |
| **Tier 2 (Oranye)** | Aktif dalam **1 - 2 bulan** (31 - 60 hari) | Border kiri **Oranye** (`#f97316`) & latar semu | 🟠 `1-2 Bulan · Terkunci (X hr lalu)` | **Terkunci:** Tidak dapat dihapus atau dinonaktifkan |
| **Tier 3 (Kuning)** | Aktif dalam **2 - 3 bulan** (61 - 90 hari) | Border kiri **Kuning** (`#eab308`) & latar semu | 🟡 `2-3 Bulan · Terkunci (X hr lalu)` | **Terkunci:** Tidak dapat dihapus atau dinonaktifkan |
| **Tier Safe (Hijau)** | **> 3 bulan** (> 90 hari) atau **Belum Pernah Login** | Border kiri **Hijau** (`#10b981`) & latar semu | 🟢 `> 3 Bulan / Belum Login · Bisa Dihapus` | **Bebas Dikelola:** Super Admin dapat menonaktifkan atau menghapus akun |

### Fitur UI Tambahan:
- **Legenda Visual Terpadu:** Toolbar legenda ditambahkan tepat di atas tabel IAM (`🛡️ Status Hak Akses Portal: < 1 Bln, 1-2 Bln, 2-3 Bln, > 3 Bln`).
- **Ikon Gembok (Lock Visual):** Tombol tindakan pada baris yang terkunci menampilkan ikon `🔒 Terkunci` dan `title` berisi jumlah hari sejak login terakhir.
- **Dialog Modal Informatif:** Jika tombol pada baris terkunci ditekan, muncul modal penolakan yang menjelaskan jumlah hari login serta aturan kebijakan 3 bulan.

---

## 4. Bukti Pengujian & Verifikasi

1. **Pemeriksaan Tipe Data Monorepo:**
   ```
   npm run typecheck:all
   -> 10 dari 10 workspace lulus tanpa error TypeScript.
   ```
2. **Pengujian Unit & Integrasi:**
   ```
   npm test
   -> 43 test files passed (213 tests passed).
   ```
3. **Pengujian Database Langsung (Production Supabase Integration):**
   ```
   node tooling/test-platform-iam.mjs
   ✓ Testing platform_get_iam with and without school_id filter: PASSED
   ✓ Blocked deactivation of active portal user: PASSED
   ✓ Deactivation of idle portal user (> 3 months): PASSED
   ✓ Blocked deletion of active portal user: PASSED
   ✓ Deletion of idle portal user (> 3 months): PASSED
   ✓ Cleanup completed: PASSED
   ```
4. **Verifikasi Sinkronisasi SMA Negeri 3 Watampone:**
   - Sebelum perbaikan: 12 baris (1 Admin + 11 Portal, di mana 9 telah dihapus oleh Admin Sekolah).
   - Setelah perbaikan: 3 baris (1 Admin Sekolah + 2 Portal aktif yang memang terdaftar di `qr_access_tokens`), 100% identik dengan yang terlihat di menu Admin Sekolah.
5. **Build Produksi:**
   ```
   npm run vercel-build
   -> 9 frontend entrypoint berhasil di-package.
   ```
