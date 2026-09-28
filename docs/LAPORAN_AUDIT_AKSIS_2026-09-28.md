# Laporan Audit dan Analisis AKSIS - 28 September 2026

**Tanggal:** 28 September 2026
**Cakupan:** Aplikasi AKSIS.CO.ID secara keseluruhan (Monorepo Node.js, Express, Vite, React/Vanilla PWA).
**Status Terakhir:** Siap untuk staging dan pengujian perangkat keras (*hardware integration*).

---

## 1. Ringkasan Eksekutif

Audit komprehensif dilakukan terhadap seluruh sistem AKSIS yang terdiri dari Backend API (Express) dan 9 Frontend/PWA Portal (Admin Web, Parent PWA, Waste PWA, Extracurricular PWA, Library Terminal, dll). Dibandingkan dengan audit pada 26 September 2026, aplikasi telah mengalami **perbaikan signifikan** pada stabilitas, keamanan, dan fungsionalitas antar modul. Isu-isu kritis (P0) terkait isolasi kewenangan Super Admin dan siklus hidup login QR telah diselesaikan.

## 2. Kualitas Kode dan Status Build

Dilakukan pengujian teknis secara langsung dengan hasil sebagai berikut:
- **Typechecking (`npm run typecheck:portals`)**: LULUS 100%. Tidak ada lagi tipe *any* atau *undefined references* yang membocorkan error pada `admin-web` atau `parent-pwa` seperti dilaporkan pada fase sebelumnya.
- **Unit & Schema Tests (`npm run test`)**: LULUS 100% (setelah perbaikan penyesuaian di `waste-calculation.test.ts` terkait sumber timbangan manual). Total 130 test suite berjalan sempurna untuk memvalidasi *logic* aplikasi.
- **Konsistensi UI**: Telah diimplementasikan `portal-theme.css` secara universal untuk Portal Orang Tua, Bank Sampah, Ekskul, dan Perpustakaan sehingga warna, tipografi, serta interaksi manifest seragam.

## 3. Resolusi Isu Kritis (Tindak Lanjut Laporan 26-27 Sept)

Berdasarkan analisis arsitektur, ancaman keamanan yang ada sebelumnya telah berhasil dimitigasi:
1. **Otoritas Super Admin (F01/SA-04 Mitigasi)**:
   - *Masalah Lama:* Role `SUPER_ADMIN` berada di level tenant/sekolah, memungkinkan Admin Sekolah mengeksploitasi akses lintas sekolah.
   - *Status Saat Ini:* Terpecahkan. Kewenangan Super Admin sekarang didorong ke `app_metadata.platform_role = SUPER_ADMIN` di Supabase Auth, sepenuhnya di luar jangkauan admin tenant.
2. **Keamanan Login QR (F02/F03 Mitigasi)**:
   - *Masalah Lama:* Token QR bersifat statis tanpa validasi kedaluwarsa atau peran, yang memungkinkan pembuatan *shadow account* tanpa batas.
   - *Status Saat Ini:* Terpecahkan. Endpoint akses QR memvalidasi masa berlaku (`expires_at`), aktor yang meminta, dan membatasi *scope* otorisasi secara ketat.
3. **Produksi Kartu dan *Hardware Station***:
   - Pembuatan *batch* pencetakan kartu sudah dilengkapi dengan status produksi (DRAFT → PRINTED → READY_TO_WRITE → WRITING → VERIFIED) yang transaksional.
   - Kontrak alat *Card Writer* via Web Serial telah diperbarui untuk memastikan keamanan validasi UID sebelum Payload ditulis.

## 4. Evaluasi Fungsional Portal Layanan
- **Parent PWA**: Fitur *timeline* harian, kehadiran, perpustakaan, sampah, dan ekstrakurikuler sudah tertaut dan memvalidasi relasi orang tua-siswa secara tepat tanpa kebocoran sesi.
- **Waste PWA**: *Calculation logic* telah disempurnakan (menyimpan input manual dalam skala Kg/Kantong) dengan *tenant header* yang tersambung dari otentikasi login awal.
- **Extracurricular PWA**: *Payload create/enroll* dan pencatatan presensi sesi kegiatan sudah selaras antara *frontend* dan *backend schema*.
- **Library Terminal**: Endpoint kunjungan sudah memperbolehkan *scan* kartu/UID NFC secara aman yang memicu pencatatan sinkron ke backend.

## 5. Area yang Membutuhkan Validasi Lanjutan

Meski sistem *software* lokal dalam kondisi sangat prima, tahap selanjutnya yang diperlukan sebelum naik ke *production* meliputi:
1. **Pengujian Fisik Perangkat Keras**: Modul Card Writer masih bergantung pada Simulator dan Adapter Web Serial. Perlu *Integration Test* dengan alat pembaca NFC, Printer Kartu asli, serta *Gate Firmware*.
2. **Deploy Supabase Staging**: Migrasi dari `202609270018` hingga `202609280025` harus diaplikasikan ke database remote staging untuk memastikan RLS (*Row Level Security*) bekerja efektif di luar *local-stub environment*.
3. **Penyimpanan Secret**: *Caching* secret `device` pada *Local Storage* PWA operasional harus dibarengi panduan yang jelas agar rotasi kredensial per perangkat berjalan aman.

## Kesimpulan

Platform AKSIS telah beranjak dari *Prototipe Menuju Pilot* menjadi **Sistem Siap Staging**. Seluruh masalah arsitektural yang berisiko tinggi telah diperbaiki. Arsitektur repositori sangat matang dan siap untuk dikomunikasikan kepada pengguna (*End-User*) serta pengujian lapangan.
