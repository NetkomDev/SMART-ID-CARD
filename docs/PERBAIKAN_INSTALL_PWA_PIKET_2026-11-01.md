# Laporan Perbaikan Alur Simpan & Install PWA Piket Kehadiran

**Tanggal:** 1 November 2026  
**Aplikasi:** PWA Piket Kehadiran (`apps/attendance-pwa`), Shared Install Prompt (`apps/shared`), API Backend (`apps/api`), Database (`supabase/migrations`)

---

## 1. Analisis Kebutuhan & Perilaku

Sebelumnya, portal PWA lain (seperti PWA Orang Tua, Bank Sampah, Ekskul, dan Terminal Perpustakaan) menggunakan modul `apps/shared/install-prompt.ts` untuk menampilkan dialog petunjuk atau pop-up instalasi aplikasi PWA (`beforeinstallprompt`).

Pada PWA Piket Kehadiran:
- Modul instalasi sudah terkonfigurasi, namun dialog/pemicu instalasi belum dipanggil secara proaktif saat pengguna pertama kali mengatur identitasnya.
- Guru piket diminta menginput nama petugas/guru piket di modal awal.
- Pengguna menginginkan tombol aksi diubah menjadi **"Simpan & Install"** sehingga saat tombol ditekan:
  1. Identitas nama guru disimpan secara lokal di perangkat.
  2. Perangkat/smartphone guru piket diikat (*device binding*) secara otomatis ke database di latar belakang (`devices` & `qr_access_tokens.last_used_at`) dengan nama petugas tersebut.
  3. Pemicu instalasi PWA langsung dijalankan saat itu juga (gesture klik form) agar prompt instalasi bawaan browser (Android/Chrome) langsung tampil, atau memunculkan panduan tambah ke layar utama di iOS/Safari.

---

## 2. Rincian Perubahan

### A. Database Migration (`supabase/migrations/202611010008_bind_attendance_scanner.sql`)
- Membuat fungsi RPC database `public.bind_attendance_scanner(p_device_id uuid, p_scanner_name text)` dengan `SECURITY DEFINER`.
- Menyimpan/mengaitkan ID perangkat (`GATE`) ke tabel `public.devices` dengan nama guru/petugas piket serta konfigurasi `{ "is_mobile_pwa": true, "scanner_name": p_scanner_name }`.
- Memperbarui `last_used_at` pada `public.qr_access_tokens` untuk token portal yang sedang aktif.

### B. API Route & Schema (`apps/api/src/routes/attendance.ts` & `apps/api/src/schemas/attendance.ts`)
- Menambahkan skema validasi `attendanceRegisterDeviceSchema` (`device_id`: UUID, `scanner_name`: string minimal 2 karakter).
- Menambahkan endpoint `POST /attendance/register-device` yang diproteksi oleh permission `attendance.scan`, memanggil RPC `bind_attendance_scanner`.

### C. Shared PWA Install Utility (`apps/shared/install-prompt.ts`)
- Menambahkan fungsi `promptOrOfferInstall(): Promise<boolean>`.
- Jika event `beforeinstallprompt` sudah tertangkap dari browser, langsung memicu prompt instalasi native (`event.prompt()`) secara synchronous dalam context event klik pengguna.
- Jika browser tidak mendukung event native atau aplikasi diakses dari perangkat seperti iOS Safari, dialog modal panduan pemasangan akan langsung ditampilkan secara otomatis (`show(true)`).

### D. PWA Piket Kehadiran (`apps/attendance-pwa`)
- Mengubah teks tombol pada `#modal-scanner-name` menjadi **"Simpan & Install"** (`#btn-submit-scanner-name`).
- Pada event submit `#form-scanner-name`:
  1. Menyimpan nama guru ke `localStorage` (`nameKey()`) dan memperbarui tampilan badge `#scanner-name-display`.
  2. Menutup modal `#modal-scanner-name`.
  3. Mengirimkan request pendaftaran perangkat ke `/attendance/register-device` di latar belakang (`portal.request`).
  4. Menjalankan `promptOrOfferInstall()` secara bersamaan untuk memicu dialog/prompt instalasi PWA ke layar HP pengguna.

---

## 3. Bukti Pengujian

1. **Uji Integrasi End-to-End Headless Browser (`tooling/test-attendance-install-prompt.mjs`)**:
   - Membuka halaman PWA Piket Kehadiran dengan viewport mobile (390x844).
   - Memverifikasi teks tombol modal adalah `"Simpan & Install"`.
   - Mengisi input nama: `"Pak Budi (Guru Piket)"` dan mengeklik tombol `"Simpan & Install"`.
   - Memverifikasi modal tertutup, nama guru tampil pada badge UI (`#scanner-name-display`), pemicu instalasi PWA native dijalankan (`[install-prompt] Triggering native install prompt`), serta payload pendaftaran perangkat terkirim ke backend.
   - Hasil: **ALL ATTENDANCE INSTALL PROMPT TESTS PASSED**.

2. **Pemeriksaan Typecheck (`npm run typecheck:all`)**:
   - Berhasil lulus 100% untuk seluruh modul (api, admin-web, attendance-pwa, shared, dll).

3. **Pemeriksaan Unit Test (`npm test`)**:
   - Berhasil lulus: **48 test files passed**, **246 tests passed**.

4. **Pemeriksaan Build Produksi (`npm run vercel-build`)**:
   - Berhasil mem-bundle 10 entrypoints frontend dan API tanpa error.
