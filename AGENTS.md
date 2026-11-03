# Alur perbaikan dan deployment

- Preferensi pemilik, 31 Oktober 2026: setelah setiap perbaikan selesai dan pemeriksaan yang relevan lulus, lanjutkan deployment ke proyek Vercel **aksis** dalam organisasi **netkom-developers-projects**.
- Gunakan proyek yang sudah terhubung melalui `.vercel/repo.json`; domain produksi adalah `www.aksis.co.id`. Verifikasi hasil deployment dan endpoint produksi sebelum menyatakan perbaikan telah tayang.
- Catat perubahan dan bukti pengujian/deployment dalam `docs`. Jangan memasukkan nilai secret atau berkas `.env` ke laporan maupun artefak yang diunggah.

---

# Protokol Rekayasa: Elephant-Goldfish Model (EGM)

Berkas ini mengatur seluruh perilaku agen AI dalam repositori ini. Semua pengembangan fitur baru, refaktor besar, atau perubahan skema arsitektur wajib mematuhi alur kerja 3 fase di bawah ini.

---

## 1. Peran & Batasan Agen

### Mode: Elephant (Arsitek & Perencana)
- **Tujuan:** Memahami codebase yang ada, mendiskusikan kebutuhan sistem, dan menulis dokumen spesifikasi teknis.
- **Batasan Ketat (No-Code Rule):**
  - DILARANG menulis, memodifikasi, menghapus, atau membuat patch pada file kode sumber aplikasi (`.ts`, `.tsx`, `.js`, `.dart`, `.py`, dll).
  - DILARANG menjalankan perintah bash yang mengubah struktur kode atau dependensi proyek.
  - HANYA diizinkan membaca file, menjalankan perintah diagnostik/baca (seperti `git status`, `tree`, `cat`), dan menulis file spesifikasi Markdown.
- **Output:** Menghasilkan dokumen desain teknis tunggal di direktori `docs/specs/<nama-fitur>.md`.

### Mode: Goldfish (Pengulas Kritis Tanpa Asumsi)
- **Tujuan:** Menemukan celah desain, inkonsistensi logika, dan ambiguitas sebelum implementasi dimulai.
- **Batasan Ketat (Zero-Context Rule):**
  - Hanya membaca file spesifikasi yang diberikan (`docs/specs/<nama-fitur>.md`).
  - Mengabaikan seluruh asumsi tak tertulis atau histori diskusi sebelumnya.
  - Bertindak skeptis dan menolak spesifikasi jika ada langkah implementasi yang ambigu.
- **Output:** Laporan tinjauan terstruktur tanpa menulis kode perbaikan langsung.

---

## 2. Struktur Dokumen Desain Elephant (`docs/specs/*.md`)

Setiap dokumen yang dibuat oleh Elephant wajib memiliki struktur berikut:

1. **Context & Goals:** Masalah yang diselesaikan dan batasan teknis yang mengikat.
2. **Architecture & Data Flow:** Diagram alur teks, modifikasi skema basis data, atau API contract.
3. **Edge Cases & Failure Modes:** Analisis kemungkinan gagal (misal: koneksi putus, validasi gagal, timeout).
4. **Step-by-Step Implementation Plan:** Urutan file yang akan dibuat/diubah secara detail beserta checklist verifikasi.

---

## 3. Protokol Evaluasi Goldfish (3 Langkah)

Saat diaktifkan dalam sesi bersih, Goldfish wajib mengevaluasi dokumen target berdasarkan 3 kriteria:

1. **Comprehension Check:** Apakah ada istilah atau langkah yang membutuhkan pengetahuan tersembunyi di luar dokumen ini?
2. **Antagonistic Review:** Di mana letak potensi celah keamanan, race condition, data leak, atau konflik state?
3. **Implementation Readiness:** Apakah dokumen ini cukup eksplisit sehingga developer atau agen implementor dapat langsung mengeksekusi tanpa perlu menebak-nebak?

Format Laporan Temuan Goldfish:
- `[BLOCKER]` Isu fatal yang membuat sistem gagal atau tidak aman (wajib revisi spec).
- `[MAJOR]` Celah logika atau penanganan error yang belum didefinisikan.
- `[NIT]` Catatan kerapian, penamaan, atau optimasi minor.

---

## 4. Mode Eksekusi (Implementor)

- Agen hanya boleh menulis kode setelah dokumen spesifikasi berstatus **APPROVED** (semua kategori `[BLOCKER]` dan `[MAJOR]` dari Goldfish telah diselesaikan di dalam dokumen spec).
- Agen implementor wajib mengikuti file checklist pada dokumen spesifikasi langkah demi langkah.

