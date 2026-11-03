# Spesifikasi Teknis: Audit Aplikasi & Pembersihan Tuntas Direktori Monorepo (`workspace-cleanup`)

**Status:** APPROVED
**Tanggal:** 2026-11-03
**Mode Protokol:** Elephant-Goldfish Model (EGM)

---

## 1. Context & Goals

### 1.1 Latar Belakang Masalah
Audit mendalam tahap pertama dan kedua pada repositori `AKSIS.CO.ID` menemukan akumulasi berkas sampah, artefak pengujian biner, skrip usang, serta duplikasi dokumentasi di beberapa lapisan direktori:
1. **Direktori Root (`AKSIS.CO.ID/`):** Menyimpan 38 berkas skrip *debugging* satu kali pakai (`test-*.js`, `check-*.js`, `temp_line*.txt`, `db_dump.sql`, `parent_profile.sql`, `Launcher Icon.png`, dll.), direktori sementara (`scratch/`, `scripts/`), serta 3 duplikat tersembunyi dari berkas aturan `AGENTS.md` (`.agentrules`, `.agents/`, `.antigravity/`).
2. **Direktori `.vercel/`:** Menyimpan 42 berkas dump SQL dan JSON sementara (`attendance-audit-*`, `attendance-migration-*`, `loan-*`, `parent-*`, `.env.production.local`) sebesar 668 KB di luar berkas konfigurasi `repo.json`.
3. **Direktori `docs/` (167 berkas / 11 MB):**
   - Subdirektori `docs/analysis/` menyimpan 109 berkas tangkapan layar PNG dan dump JSON pengujian lama sebesar **10,7 MB**.
   - Root `docs/` menyimpan 49 laporan harian historis (`LAPORAN_*`, `PERBAIKAN_*`, `AUDIT_*`, `PHASE_*`) yang sudah digantikan oleh 18 berkas kontrak `README.md` EGM dan riwayat Git.
4. **Direktori `tooling/` (37 berkas):**
   - 2 skrip *one-off* (`debug-pwa.mjs`, `optimize-admin-brand.mjs`).
   - 6 skrip shell basis data lama (`test-phase-11-library.sh`, `test-portal-qr.sh`, `test-super-admin-db.sh`, `test-waste-db.sh`, `test-waste-db-local.sh`, `test-parent-db-local.sh`) yang sepenuhnya redundan terhadap runner kanonik `tooling/test-db-local.sh`.
   - 4 skrip browser bulan September (`test-parent-pwa.mjs`, `test-pwa-ui.mjs`, `test-super-admin-browser.mjs`, `test-waste-pwa.mjs`) yang memanggil paket `puppeteer` (tidak terinstal) dan endpoint v0.1 yang sudah tidak ada.
   - 9 skrip *one-off* yang tidak direferensikan di `package.json` (`test-attendance-install-prompt.mjs`, `test-durable-pwa-queue.mjs`, `test-library-loans-offline.mjs`, `test-platform-iam.mjs`, `test-pwa-portals-permanent.mjs`, `test-waste-offline-sync.mjs`, `verify-attendance-production.mjs`, `verify-parent-production.mjs`, `verify-scanner-production.mjs`).
5. **Aset Tidak Terpakai di `apps/`:** `apps/parent-pwa/public/parent-banner.png` (623 KB), `apps/parent-pwa/public/parents-avatar.png` (506 KB), `apps/shared/assets/header-pwa.svg`, `apps/akun akses.md`, `apps/api/scratch.ts`, dan `apps/api/test_rpc.ts`.

### 1.2 Tujuan (Goals)
1. Menghapus seluruh berkas tidak terpakai, dump sementara di `.vercel/`, tangkapan layar pengujian lama di `docs/analysis/`, laporan historis redundan di `docs/`, serta skrip usang di `tooling/`.
2. Menyelaraskan `package.json` agar seluruh skrip `test:db:*` menggunakan `tooling/test-db-local.sh` dan hanya menyisakan skrip `test:browser:*` yang aktif dan terverifikasi.
3. Memperbarui `tooling/verify-production.mjs` agar memverifikasi seluruh 10 entrypoint produksi, API health, batas autentikasi, dan aset bundel secara deterministik.
4. Memastikan seluruh pemeriksaan (`npm run verify`, `npm run vercel-build`), deployment Vercel (`www.aksis.co.id`), dan commit ke GitHub (`origin/main`) tuntas.

---

## 2. Architecture & Data Flow

### 2.1 Struktur Akhir Direktori `docs/` dan `tooling/`
- **`docs/` (9 berkas kanonik):**
  - `docs/BLUEPRINT.md`
  - `docs/openapi.yaml`
  - `docs/2026-11-02_DRIFT_REPORT.md`
  - `docs/LAPORAN_PEMBERSIHAN_DIREKTORI_AKSIS_2026-11-03.md`
  - `docs/operations/DEPLOYMENT.md`
  - `docs/operations/PRODUCTION_READINESS.md`
  - `docs/specs/landingpage.md`
  - `docs/specs/landingpage-ecosystem-alignment.md`
  - `docs/specs/workspace-cleanup.md`
- **`tooling/` (16 skrip aktif):**
  - Build & Packaging: `verify-apps.mjs`, `package-sites.mjs`, `generate-brand-icons.mjs`
  - Operasi Platform: `platform-authority.mjs`
  - Database Runner & Concurrency: `test-db-local.sh`, `test-attendance-concurrency.mjs`
  - Browser E2E Suites: `create-scanner-test-video.mjs`, `test-admin-workspace.mjs`, `test-attendance-browser.mjs`, `test-attendance-voice.mjs`, `test-command-center.mjs`, `test-parent-onboarding.mjs`, `test-pwa-camera-device.mjs`, `test-pwa-scanners.mjs`, `test-remediation-browser.mjs`
  - Verifikasi Produksi: `verify-production.mjs`

---

## 3. Edge Cases & Failure Modes

1. **Kompatibilitas CI GitHub Actions (`.github/workflows/verify.yml`):**
   - Workflow CI menjalankan `npm ci`, `npm run verify`, `npm run test:db:all`, dan `npm run test:db:upgrade`. Seluruh skrip ini menggunakan `tooling/verify-apps.mjs` dan `tooling/test-db-local.sh` yang tetap dipertahankan 100%.
2. **Keamanan `.vercel/repo.json`:**
   - Pembersihan `.vercel/` wajib mempertahankan `.vercel/repo.json` agar keterhubungan proyek Vercel `aksis` (`netkom-developers-projects`) tidak terputus.
3. **Aturan Kanonik `AGENTS.md`:**
   - `AGENTS.md` tetap dipertahankan di root sebagai satu-satunya sumber aturan agen (`<user_rules>`), sedangkan duplikat `.agentrules`, `.agents/`, dan `.antigravity/` dihapus.

---

## 4. Step-by-Step Implementation Plan

### Langkah 1: Pembersihan Tahap 1 (Telah Selesai pada Commit `dabadf1`)
- [x] Hapus 38 berkas skrip/gambar/log sampah di root, `scratch/`, `scripts/`, `supabase/.temp/`, `.DS_Store`, serta aset tak terpakai di `apps/parent-pwa/public/` dan `apps/shared/assets/header-pwa.svg`.

### Langkah 2: Pembersihan Dump Sementara di `.vercel/` & Duplikat Aturan Root
- [x] Hapus seluruh berkas `.sql`, `.json` (kecuali `repo.json`), dan `.env.production.local` di dalam `.vercel/`.
- [x] Hapus `.agentrules`, `.agents/`, dan `.antigravity/` (duplikat dari `AGENTS.md`).

### Langkah 3: Pembersihan Arsip Biner `docs/analysis/` & Laporan Harian Lama di `docs/`
- [x] Hapus `docs/analysis/` (109 berkas tangkapan layar & JSON, 10,7 MB).
- [x] Hapus 49 berkas laporan harian lama di `docs/` sehingga hanya menyisakan `BLUEPRINT.md`, `openapi.yaml`, `2026-11-02_DRIFT_REPORT.md`, `LAPORAN_PEMBERSIHAN_DIREKTORI_AKSIS_2026-11-03.md`, `operations/*`, dan `specs/*`.

### Langkah 4: Konsolidasi `tooling/` dan `package.json`
- [x] Hapus 6 skrip shell DB redundan (`test-phase-11-library.sh`, `test-portal-qr.sh`, `test-super-admin-db.sh`, `test-waste-db.sh`, `test-waste-db-local.sh`, `test-parent-db-local.sh`) dan arahkan skrip `test:db:*` di `package.json` ke `bash tooling/test-db-local.sh ...`.
- [x] Hapus 4 skrip browser v0.1 yang rusak (`test-parent-pwa.mjs`, `test-pwa-ui.mjs`, `test-super-admin-browser.mjs`, `test-waste-pwa.mjs`) beserta entri `package.json`-nya.
- [x] Hapus 9 skrip *one-off* tak terpakai (`test-attendance-install-prompt.mjs`, `test-durable-pwa-queue.mjs`, `test-library-loans-offline.mjs`, `test-platform-iam.mjs`, `test-pwa-portals-permanent.mjs`, `test-waste-offline-sync.mjs`, `verify-attendance-production.mjs`, `verify-parent-production.mjs`, `verify-scanner-production.mjs`).
- [x] Perbarui `tooling/verify-production.mjs` dan tambahkan `"verify:production": "node tooling/verify-production.mjs"` di `package.json`.

### Langkah 5: Verifikasi, Deployment & Commit ke GitHub
- [x] Jalankan `npm run verify` dan `npm run vercel-build`.
- [x] Deploy ke produksi Vercel (`www.aksis.co.id`) dan jalankan `npm run verify:production`.
- [x] Perbarui laporan `docs/LAPORAN_PEMBERSIHAN_DIREKTORI_AKSIS_2026-11-03.md`, commit seluruh perubahan, dan push ke `origin/main`.

---

## 5. Goldfish Review Log
- **Comprehension Check:** Seluruh berkas yang dihapus dan dipertahankan terdefinisi secara eksplisit.
- **Antagonistic Review:** Tidak ada pengurangan cakupan pengujian unit/integrasi (50 suite Vitest dan 12 suite SQL PostgreSQL tetap utuh).
- **Implementation Readiness:** Siap dieksekusi secara deterministik. Status: **APPROVED**.
