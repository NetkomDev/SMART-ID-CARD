# Spesifikasi Teknis: Audit Aplikasi & Pembersihan Direktori Monorepo (`workspace-cleanup`)

**Status:** APPROVED
**Tanggal:** 2026-11-03
**Mode Protokol:** Elephant-Goldfish Model (EGM)

---

## 1. Context & Goals

### 1.1 Latar Belakang Masalah
Direktori root dan subdirektori repositori `AKSIS.CO.ID` saat ini menyimpan puluhan berkas sementara, skrip *debugging* satu kali pakai (*one-off scripts*), dump log basis data kosong/usang, duplikat aset gambar di root, serta aset statis yang tidak pernah direferensikan di dalam paket PWA. Keberadaan berkas-berkas ini menyebabkan:
1. Polusi direktori root (`AKSIS.CO.ID/`) dengan lebih dari 35 berkas tidak terpakai (`test-*.js`, `check-*.js`, `temp_*.txt`, `db_dump.sql`, `parent_profile.sql`, `Launcher Icon.png`, dll.).
2. Pembengkakan ukuran bundle publik dan *build output* (`dist/`), khususnya pada `apps/parent-pwa/public/` yang memuat `parent-banner.png` (623 KB) dan `parents-avatar.png` (506 KB) tanpa referensi kode sama sekali (menambah >2,2 MB beban ganda antara `apps/parent-pwa/dist` dan `dist/parent`).
3. Potensi risiko operasional akibat skrip mentah seperti `update-env.sh` dan `test-*.js` yang memuat pemanggilan langsung `SUPABASE_SERVICE_ROLE_KEY`.
4. Direktori cache lokal Supabase CLI (`supabase/.temp/`) dan berkas sistem macOS (`.DS_Store`) ikut mengotori *working tree* atau indeks Git.

### 1.2 Tujuan (Goals)
1. Menghapus seluruh berkas *garbage*, skrip *debugging* sementara, direktori kosong/usang (`scratch/`, `scripts/`, `supabase/.temp/`), dan aset tidak terpakai tanpa mengubah perilaku fungsional 10 aplikasi frontend maupun backend API.
2. Memperbaiki `tooling/generate-brand-icons.mjs` agar menggunakan `apps/shared/assets/aksis-logo-master.png` sebagai sumber kanonik dan tidak lagi menulis ulang berkas gambar duplikat ke direktori root.
3. Menyederhanakan `.gitignore` dan `.vercelignore` agar bersih dan selaras dengan struktur monorepo yang telah diringkas.
4. Memastikan seluruh *gate* verifikasi (`npm run typecheck:all`, `npm test`, `npm run vercel-build`) lulus 100% dan menayangkan hasilnya ke produksi Vercel (`www.aksis.co.id`).

---

## 2. Architecture & Data Flow

### 2.1 Peta Arsitektur Monorepo Kanonik (Pasca-Pembersihan)
```text
AKSIS.CO.ID/
├── api/                        # Entrypoint Serverless Function Vercel (/api/v1/*)
├── apps/                       # 10 aplikasi klien + 1 backend API + 1 pustaka bersama
│   ├── admin-web/              # Portal Admin Sekolah & Super Admin + Landing Page
│   ├── api/                    # Express Core API Engine + Vitest suite
│   ├── attendance-pwa/         # PWA Piket Kehadiran Gerbang (Offline + TTS Voice)
│   ├── card-writer/            # Stasiun Web Serial Penulis Kartu Pintar NFC/RFID
│   ├── command-center/         # Layar TV Pantau KPI Real-Time
│   ├── extracurricular-pwa/    # PWA Absensi Ekstrakurikuler
│   ├── led-gateway/            # Gateway & Simulator Matriks LED Sekolah
│   ├── library-terminal/       # Kios Kunjungan & Peminjaman Buku Perpustakaan
│   ├── operations-console/     # Konsol Ekspor Laporan CSV & Audit
│   ├── parent-pwa/             # Portal Pantau Orang Tua Siswa
│   ├── shared/                 # Modul Bersama (DurableQueue, QRCamera, NaturalVoice, Session)
│   └── waste-pwa/              # PWA Piket Bank Sampah
├── docs/                       # Dokumentasi arsitektur, kontrak EGM, spesifikasi, dan laporan audit
├── firmware/                   # Firmware perangkat keras ESP32 + PN532
├── supabase/                   # Migrasi SQL berurutan, seed, dan suite uji integrasi RLS/RPC
├── tooling/                    # Skrip orkestrasi build, packaging, dan pengujian otomatis
├── vendor/                     # Paket tarball lokal terverifikasi (xlsx-0.20.3.tgz)
├── package.json                # Definisi skrip dan dependensi monorepo
├── vercel.json                 # Konfigurasi routing edge, rewrite, dan header keamanan
└── vitest.config.ts            # Konfigurasi runner pengujian unit/integrasi
```

### 2.2 Kontrak Data & Build Pipeline
Tidak ada perubahan pada kontrak REST API (`/api/v1/*`), skema basis data PostgreSQL (`supabase/migrations/*`), maupun aturan *rewrite* di `vercel.json`. Alur pemaketan produksi tetap berjalan melalui:
```text
npm run vercel-build
  ├── node tooling/verify-apps.mjs build   # Membangun api + 10 aplikasi frontend di apps/*/dist
  └── node tooling/package-sites.mjs       # Menyalin 10 output frontend ke dist/
```

---

## 3. Edge Cases & Failure Modes

1. **Penghapusan Aset `Header-PWA.svg` yang Masih Dipakai CSS Bersama:**
   - *Analisis:* `apps/shared/portal-theme.css` dan `apps/parent-pwa/src/styles.css` mereferensikan `url("/Header-PWA.svg")`. Oleh karena itu, `apps/*/public/Header-PWA.svg` (termasuk `apps/admin-web/public/Header-PWA.svg` yang disalin ke root `dist/Header-PWA.svg`) **WAJIB DIPERTAHANKAN**. Hanya duplikat yang tidak pernah diimpor yaitu `apps/shared/assets/header-pwa.svg` yang dihapus.
2. **Arsip Sumber eSpeak-NG (`espeak-ng-1.49.1-source.tar.gz`):**
   - *Analisis:* Berkas `apps/attendance-pwa/public/tts/espeak-ng-1.49.1-source.tar.gz` wajib ada untuk kepatuhan lisensi GPLv3 (`NOTICE.txt`) dan diverifikasi secara eksplisit oleh `tooling/verify-attendance-production.mjs`. Berkas ini **WAJIB DIPERTAHANKAN**.
3. **Regenerasi Ikon Merek (`tooling/generate-brand-icons.mjs`):**
   - *Analisis:* Sebelumnya `tooling/generate-brand-icons.mjs` membaca path absolut eksternal `/Users/berech/.gemini/...` dan menulis ulang `Launcher Icon.png`, `logo_transparent.png`, `Logo.svg`, dan `test-512.png` ke direktori root. Jika skrip ini tidak diperbarui, menjalankan ulang generator ikon akan gagal (jika file eksternal hilang) atau mengotori root kembali. Solusi: gunakan `apps/shared/assets/aksis-logo-master.png` sebagai fallback default dan hapus penulisan 4 berkas duplikat di root.
4. **Berkas Aturan Agen (`.agentrules`, `.agents/rules/egm.md`, `.antigravity/rules.md`, `AGENTS.md`):**
   - *Analisis:* Keempat berkas ini merupakan protokol rekayasa aktif di repositori dan **WAJIB DIPERTAHANKAN**.

---

## 4. Step-by-Step Implementation Plan

### Langkah 1: Hapus Berkas Sampah & Skrip Debugging di Direktori Root
Hapus berkas-berkas berikut dari indeks Git dan sistem berkas:
- [x] `check-fk.js`
- [x] `check-qr.js`
- [x] `check_js_error.js`
- [x] `db_dump.sql`
- [x] `db_error.log`
- [x] `parent_profile.sql`
- [x] `print-console.mjs`
- [x] `query-qr.js`
- [x] `remove_bg.js`
- [x] `run-all.sh`
- [x] `update-env.sh`
- [x] `temp_line.txt`
- [x] `temp_lines.txt`
- [x] `temp_lines2.txt`
- [x] `temp_lines3.txt`
- [x] `temp_lines4.txt`
- [x] `Launcher Icon.png`
- [x] `Logo.svg`
- [x] `logo_transparent.png`
- [x] `test-512.png`
- [x] `test-check-deleted.js`
- [x] `test-constraint.js`
- [x] `test-delete.js`
- [x] `test-generate-qr.js`
- [x] `test-hard-delete.js`
- [x] `test-manual-delete.js`
- [x] `test-portal-active.js`
- [x] `test-portal-active2.js`
- [x] `test-raw-sql.js`
- [x] `test-refresh-twice.js`
- [x] `test-refresh.js`
- [x] `test-vercel-api.js`
- [x] `test.js`
- [x] `test_login.js`
- [x] `test_rpc.js`
- [x] `test_rpc.ts`
- [x] `.env.test` dan `.env.test.prod` (berkas env lokal usang yang hanya dipakai oleh skrip `test-*.js` di atas; `.env`, `.env.local`, dan `.env.example` tetap dipertahankan)

### Langkah 2: Hapus Direktori Sementara, Log Lokal & Cache CLI
- [x] Hapus direktori `scratch/` beserta isinya (`scratch/seed_all_sample_data.py`, `scratch/update_all_students_full_data.py`).
- [x] Hapus direktori kosong `scripts/`.
- [x] Hapus direktori internal Supabase CLI `supabase/.temp/` dari Git dan disk.
- [x] Hapus log pengujian lokal yang tidak terlacak di `docs/analysis/2026-10-30/db-clean/`, `docs/analysis/2026-11-01/attendance-multi/auth-sessions.log`, dan `docs/analysis/2026-11-01/attendance-multi/postgres.log`.
- [x] Hapus seluruh berkas `.DS_Store` di pohon direktori proyek.

### Langkah 3: Hapus Berkas & Aset Tidak Terpakai di `apps/` dan `tooling/`
- [x] Hapus `apps/akun akses.md`
- [x] Hapus `apps/api/scratch.ts`
- [x] Hapus `apps/api/test_rpc.ts`
- [x] Hapus `apps/parent-pwa/public/parent-banner.png` (623 KB tidak terpakai)
- [x] Hapus `apps/parent-pwa/public/parents-avatar.png` (506 KB tidak terpakai)
- [x] Hapus `apps/shared/assets/header-pwa.svg` (duplikat tidak terpakai)
- [x] Hapus `tooling/debug-pwa.mjs` (skrip *one-off* rusak)
- [x] Hapus `tooling/optimize-admin-brand.mjs` (skrip *one-off* yang telah digantikan oleh `tooling/generate-brand-icons.mjs`)

### Langkah 4: Perbarui `tooling/generate-brand-icons.mjs`, `.gitignore`, dan `.vercelignore`
- [x] Di `tooling/generate-brand-icons.mjs`:
  - Gunakan `const defaultMasterPath = resolve("apps/shared/assets/aksis-logo-master.png");` dan `const masterPath = process.argv[2] ? resolve(process.argv[2]) : defaultMasterPath;`.
  - Hanya salin ke `apps/shared/assets/aksis-logo-master.png` apabila `masterPath !== defaultMasterPath`.
  - Hapus penulisan `Launcher Icon.png`, `logo_transparent.png`, `Logo.svg`, dan `test-512.png` di root.
- [x] Di `.gitignore`:
  - Rapikan aturan `.env*` yang duplikat dan tambahkan `supabase/.temp/`.
- [x] Di `.vercelignore`:
  - Hapus daftar berkas sampah yang sudah dihapus dari repositori sehingga hanya menyisakan pengecualian direktori yang relevan (`.vercel`, `.git`, `.vscode`, `.env*`, `node_modules`, `dist`, `**/dist`, `coverage`, `docs`, `supabase`, `*.log`).

### Langkah 5: Verifikasi & Deployment Produksi
- [x] Jalankan `npm run typecheck:all` (11 aplikasi lolos tanpa error).
- [x] Jalankan `npm test` (50 berkas test Vitest lulus 100%).
- [x] Jalankan `npm run vercel-build` (10 aplikasi frontend terkemas ulang di `dist/` tanpa aset sampah).
- [x] Deploy ke proyek Vercel **aksis** (`netkom-developers-projects` / `www.aksis.co.id`) dan jalankan `node tooling/verify-production.mjs`.
- [x] Catat laporan hasil analisis, pembersihan, dan verifikasi deployment ke `docs/LAPORAN_PEMBERSIHAN_DIREKTORI_AKSIS_2026-11-03.md`.

---

## 5. Goldfish Review Log

### Evaluasi Kriteria Goldfish
1. **Comprehension Check:** Seluruh path berkas yang dihapus maupun dipertahankan ditulis secara eksplisit tanpa ambiguitas. Alasan mempertahankan `apps/*/public/Header-PWA.svg` dan `espeak-ng-1.49.1-source.tar.gz` terdokumentasi dengan jelas.
2. **Antagonistic Review:** Tidak ada penghapusan berkas migrasi SQL, test suite Vitest, ataupun skrip yang direferensikan oleh `package.json` dan `.github/workflows/verify.yml`. Penghapusan skrip root yang memanggil `SUPABASE_SERVICE_ROLE_KEY` justru meningkatkan postur keamanan repositori.
3. **Implementation Readiness:** Daftar periksa eksekusi bersifat deterministik dan siap dijalankan langsung oleh agen Implementor.

** Putusan Goldfish:** Zero `[BLOCKER]`, Zero `[MAJOR]`. Status dokumen: **APPROVED**.

