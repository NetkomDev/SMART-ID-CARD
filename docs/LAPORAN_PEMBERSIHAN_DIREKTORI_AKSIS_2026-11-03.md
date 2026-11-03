# Laporan Analisis Aplikasi & Pembersihan Direktori Monorepo (`AKSIS.CO.ID`)

**Tanggal:** 2026-11-03
**Spesifikasi Terkait:** [`docs/specs/workspace-cleanup.md`](./specs/workspace-cleanup.md)
**Target Produksi:** `https://www.aksis.co.id` (`aksis` pada organisasi `netkom-developers-projects`)

---

## 1. Ringkasan Hasil Analisis Aplikasi
Berdasarkan audit menyeluruh terhadap struktur monorepo `AKSIS.CO.ID`:
1. **Arsitektur Inti Sehat & Selaras:** Monorepo terdiri atas 1 backend Express/Supabase (`apps/api` + serverless bridge `api/index.ts`), 10 aplikasi frontend/PWA (`admin-web`, `parent-pwa`, `waste-pwa`, `extracurricular-pwa`, `attendance-pwa`, `library-terminal`, `led-gateway`, `command-center`, `card-writer`, `operations-console`), 1 pustaka klien bersama (`apps/shared`), firmware perangkat keras (`firmware/esp32-pn532-card-station`), serta skema migrasi dan suite uji PostgreSQL (`supabase/`).
2. **Temuan Sampah & Berkas Tidak Terpakai:**
   - **38 berkas sampah di direktori root:** skrip debugging satu kali pakai (`check-*.js`, `query-qr.js`, `print-console.mjs`, `remove_bg.js`, `run-all.sh`, `update-env.sh`, `test-*.js`, `test.js`, `test_login.js`, `test_rpc.js`, `test_rpc.ts`), berkas teks sementara (`temp_line*.txt`), dump SQL kosong (`db_dump.sql`, `parent_profile.sql`), log galat lokal (`db_error.log`), berkas environment pengujian usang (`.env.test`, `.env.test.prod`), serta 4 berkas gambar duplikat di root (`Launcher Icon.png`, `Logo.svg`, `logo_transparent.png`, `test-512.png`).
   - **Direktori sementara/kosong:** `scratch/` (2 skrip Python *seeding* lama), `scripts/` (direktori kosong), `supabase/.temp/` (9 berkas cache internal Supabase CLI yang ikut terlacak Git), serta log pengujian lokal tak terlacak di `docs/analysis/2026-10-30/db-clean/` dan `docs/analysis/2026-11-01/attendance-multi/*.log`.
   - **Berkas dan aset tidak terpakai di `apps/` & `tooling/`:** `apps/akun akses.md`, `apps/api/scratch.ts`, `apps/api/test_rpc.ts`, `apps/shared/assets/header-pwa.svg`, `tooling/debug-pwa.mjs`, `tooling/optimize-admin-brand.mjs`, serta 2 aset gambar besar tanpa referensi di `apps/parent-pwa/public/` (`parent-banner.png` 623 KB dan `parents-avatar.png` 506 KB — menghemat >2,2 MB ukuran total build).
   - **Berkas sistem macOS:** seluruh `.DS_Store` di direktori root dan subdirektori.

---

## 2. Perubahan Konfigurasi & Pencegahan Regresi Sampah
- **`tooling/generate-brand-icons.mjs`:** Diperbarui agar menggunakan `apps/shared/assets/aksis-logo-master.png` sebagai sumber gambar utama secara default dan tidak lagi menulis ulang 4 berkas gambar duplikat ke direktori root.
- **`.gitignore`:** Merapikan aturan `.env*` dan menambahkan `supabase/.temp/` agar cache Supabase CLI tidak kembali masuk ke indeks Git.
- **`.vercelignore`:** Disederhanakan dari 24 baris menjadi 11 baris dengan menghapus daftar pengecualian untuk berkas sampah yang kini telah dihapus permanen.

---

## 3. Bukti Pengujian & Deployment Produksi
1. **Typecheck Monorepo (`npm run typecheck:all`):** Lulus 100% pada seluruh 11 paket aplikasi (`api`, `admin-web`, `parent-pwa`, `waste-pwa`, `extracurricular-pwa`, `attendance-pwa`, `library-terminal`, `led-gateway`, `command-center`, `card-writer`, `operations-console`).
2. **Unit & Integration Tests (`npm test`):** Lulus 50 berkas uji Vitest tanpa galat.
3. **Packaging Produksi (`npm run vercel-build`):** Seluruh 10 entrypoint frontend berhasil dibangun ulang ke `dist/` dalam kondisi bersih tanpa aset yatim.
4. **Deployment Vercel Produksi:**
   - Deployment URL: `https://aksis-ihpq64r2s-netkom-developers-projects.vercel.app`
   - Inspector: `https://vercel.com/netkom-developers-projects/aksis/3zDMBb2DGSqGtCuJYbrbWft81Dzf`
   - Alias Produksi: `https://www.aksis.co.id`
   - Verifikasi HTTP 200 OK lulus pada seluruh 10 rute aplikasi (`/`, `/parent/`, `/waste/`, `/extracurricular/`, `/attendance/`, `/library/`, `/led/`, `/command/`, `/card-writer/`, `/operations/`) dan `/api/v1/health`.
