# Laporan Analisis Aplikasi & Pembersihan Tuntas Direktori Monorepo (`AKSIS.CO.ID`)

**Tanggal:** 2026-11-03
**Spesifikasi Terkait:** [`docs/specs/workspace-cleanup.md`](./specs/workspace-cleanup.md)
**Target Produksi:** `https://www.aksis.co.id` (`aksis` pada organisasi `netkom-developers-projects`)

---

## 1. Ringkasan Eksekutif Analisis & Pembersihan Tuntas
Audit menyeluruh pada seluruh lapisan direktori `AKSIS.CO.ID` (root, `apps/`, `tooling/`, `docs/`, `supabase/`, dan `.vercel/`) menemukan lebih dari **230 berkas tidak terpakai/redundan** dengan total penghematan ukuran repositori dan artefak lebih dari **14 MB**. Seluruh berkas tersebut telah dihapus secara terukur tanpa menyentuh kode sumber aktif maupun cakupan pengujian otomatis.

---

## 2. Rincian Pembersihan di Setiap Lapisan Direktori

### 2.1 Direktori Root (`AKSIS.CO.ID/`) — Dikurangi dari 70 Entri Menjadi 26 Entri
- **38 Berkas Skrip Debugging, Dump SQL & Teks Sementara:**
  - `check-fk.js`, `check-qr.js`, `check_js_error.js`, `print-console.mjs`, `query-qr.js`, `remove_bg.js`, `run-all.sh`, `update-env.sh`
  - `test-check-deleted.js`, `test-constraint.js`, `test-delete.js`, `test-generate-qr.js`, `test-hard-delete.js`, `test-manual-delete.js`, `test-portal-active.js`, `test-portal-active2.js`, `test-raw-sql.js`, `test-refresh-twice.js`, `test-refresh.js`, `test-vercel-api.js`, `test.js`, `test_login.js`, `test_rpc.js`, `test_rpc.ts`
  - `db_dump.sql`, `parent_profile.sql`, `db_error.log`, `temp_line.txt`, `temp_lines.txt`, `temp_lines2.txt`, `temp_lines3.txt`, `temp_lines4.txt`, `.env.test`, `.env.test.prod`
  - `Launcher Icon.png`, `Logo.svg`, `logo_transparent.png`, `test-512.png`
- **Direktori Sementara & Duplikat Aturan:**
  - `scratch/` (`seed_all_sample_data.py`, `update_all_students_full_data.py`)
  - `scripts/` (direktori kosong)
  - `.agentrules`, `.agents/rules/egm.md`, `.antigravity/rules.md` (duplikat dari berkas aturan kanonik `AGENTS.md`)
  - Seluruh berkas sistem `.DS_Store`

### 2.2 Direktori `apps/` & `supabase/`
- **`apps/parent-pwa/public/parent-banner.png` (623 KB) & `parents-avatar.png` (506 KB):** Aset gambar tanpa referensi kode yang sebelumnya menggandakan ukuran `apps/parent-pwa/dist` dan `dist/parent` (>2,2 MB).
- **`apps/shared/assets/header-pwa.svg`:** Duplikat huruf kecil yang tidak diimpor oleh aplikasi mana pun (`Header-PWA.svg` di `apps/*/public/` tetap dipertahankan).
- **`apps/akun akses.md`, `apps/api/scratch.ts`, `apps/api/test_rpc.ts`:** Catatan lama dan skrip percobaan manual.
- **`supabase/.temp/` (9 berkas):** Cache lokal Supabase CLI yang sebelumnya ikut terlacak di Git; kini telah dihapus dari indeks Git dan ditambahkan ke `.gitignore`.

### 2.3 Direktori `tooling/` & `package.json` — Diringkas dari 37 Menjadi 16 Skrip Aktif
- **6 Skrip Shell Basis Data Redundan Dihapus:** `test-phase-11-library.sh`, `test-portal-qr.sh`, `test-super-admin-db.sh`, `test-waste-db.sh`, `test-waste-db-local.sh`, `test-parent-db-local.sh`. Seluruh skrip `test:db:*` di `package.json` kini menggunakan runner PostgreSQL terisolasi `tooling/test-db-local.sh`.
- **4 Skrip Browser v0.1 Usang Dihapus:** `test-parent-pwa.mjs`, `test-pwa-ui.mjs`, `test-super-admin-browser.mjs`, `test-waste-pwa.mjs` (skrip bulan September yang memanggil paket `puppeteer` yang tidak terinstal dan endpoint lama).
- **11 Skrip *One-Off* Tanpa Referensi Dihapus:** `debug-pwa.mjs`, `optimize-admin-brand.mjs`, `test-attendance-install-prompt.mjs`, `test-durable-pwa-queue.mjs`, `test-library-loans-offline.mjs`, `test-platform-iam.mjs`, `test-pwa-portals-permanent.mjs`, `test-waste-offline-sync.mjs`, `verify-attendance-production.mjs`, `verify-parent-production.mjs`, `verify-scanner-production.mjs`.
- **Perbaikan `tooling/generate-brand-icons.mjs` & `tooling/verify-production.mjs`:** Disempurnakan agar mandiri, bebas *hardcoded path* lokal/eksternal, dan terdaftar melalui `npm run verify:production`.

### 2.4 Direktori `docs/` — Diringkas dari 167 Berkas (11 MB) Menjadi 9 Berkas Kanonik (180 KB)
- **`docs/analysis/` (109 berkas / 10,7 MB):** Seluruh tangkapan layar PNG dan dump JSON pengujian headless lama telah dihapus.
- **49 Laporan Harian Historis (`docs/LAPORAN_*`, `docs/PERBAIKAN_*`, `docs/AUDIT_*`, `docs/PHASE_*`):** Dihapus karena seluruh kontrak arsitektur terkini telah terdokumentasi di dalam 18 berkas kontrak `README.md` EGM, `docs/BLUEPRINT.md`, `docs/openapi.yaml`, `docs/operations/*`, dan `docs/specs/*`.

### 2.5 Direktori `.vercel/` — Diringkas dari 43 Berkas (672 KB) Menjadi 1 Berkas (`repo.json`)
- Menghapus 42 berkas dump SQL/JSON migrasi sementara (`attendance-audit-*`, `attendance-migration-*`, `loan-*`, `parent-*`, `.env.production.local`) dengan tetap mempertahankan `.vercel/repo.json`.

---

## 3. Bukti Verifikasi & Status GitHub
1. **Typecheck (`npm run typecheck:all`):** Lulus 100% pada 11 aplikasi (`api` + 10 aplikasi frontend).
2. **Unit & Integration Tests (`npm test`):** Lulus 100% pada 50 berkas uji Vitest (256 pengujian).
3. **Production Build (`npm run vercel-build`):** Lulus 100%, menghasilkan bundel `dist/` yang bersih untuk 10 aplikasi frontend.
4. **Production Smoke Verification (`npm run verify:production`):** Lulus 100% terhadap `https://www.aksis.co.id` (10 entrypoint HTML, `/api/v1/health`, batas autentikasi `/api/v1/dashboard/today`, dan integritas aset statis).
