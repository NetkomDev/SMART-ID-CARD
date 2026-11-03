# Spesifikasi Desain Arsitektur: Sinkronisasi & Penyelarasan Menyeluruh Landing Page dengan Ekosistem AKSIS

- **ID Dokumen:** `SPEC-EGM-LANDING-002`
- **Target File:** `docs/specs/landingpage-ecosystem-alignment.md`
- **Status:** `APPROVED`
- **Penyusun:** Mode Elephant (Arsitek & Perencana)
- **Repositori:** `NetkomDev/SMART-ID-CARD` (`www.aksis.co.id`)
- **Tanggal:** 2026-11-03

---

## 1. Context & Goals

### 1.1. Latar Belakang & Masalah
Hasil audit menyeluruh terhadap repositori monorepo AKSIS menunjukkan bahwa platform telah memiliki **10 aplikasi dan portal produksi aktif**, yaitu:
1. `apps/admin-web`: Portal Manajemen Sekolah, Dapodik Sync, Template Kartu, Manajemen Jam Masuk/Pulang, IAM & Audit.
2. `apps/parent-pwa` (`/parent`): Portal Orang Tua Siswa dengan otentikasi mandiri NISN + Tanggal Lahir, pemantauan kehadiran jam gerbang live, tabungan sampah, sirkulasi perpus, dan ekskul.
3. `apps/attendance-pwa` (`/attendance`): Piket Kehadiran Gerbang dengan scan QR <1 detik, offline-resilience 7 hari, audio suara alami (*Natural Voice Speech*), dan sync background.
4. `apps/waste-pwa` (`/waste`): Portal Bank Sampah Edukatif Sekolah Adiwiyata, penimbangan kg terpilah, konversi poin/saldo tabungan.
5. `apps/library-terminal` (`/library`): Terminal Mandiri Kunjungan & Sirkulasi Peminjaman Buku Perpustakaan.
6. `apps/extracurricular-pwa` (`/extracurricular`): Portal Pembina Ekskul, presensi sesi, dan kalkulasi predikat otomatis rapor (A/B/C/D).
7. `apps/led-gateway` (`/led`): Display Gateway LED Matrix / Running Text gerbang untuk menyapa siswa secara visual saat tap kartu.
8. `apps/command-center` (`/command`): Command Center TV Monitor ruang Kepala Sekolah/Lobi dengan indikator freshness real-time.
9. `apps/card-writer` (`/card-writer`): Terminal Produksi & Encoding Fisik Kartu Siswa Smart ID Card.
10. `apps/operations-console` (`/operations`): Konsol Operasi Kesehatan Perangkat & Sinkronisasi IoT.

**Kesenjangan Kritis pada Landing Page Saat Ini (`apps/admin-web/src/landing/`)**:
- Landing page saat ini hanya menampilkan 5 modul lama (Smart ID Card, Presensi Gerbang, Bank Sampah, Perpustakaan, Ekskul).
- **Fitur Kunci yang Terlewat (Missing Value Propositions)**:
  1. **Portal Orang Tua Siswa (`parent-pwa`)**: Nilai jual paling diminati oleh sekolah dan wali murid (notifikasi kehadiran live, transparansi akademik/keuangan tanpa ribet instal aplikasi toko pihak ketiga).
  2. **Display LED Gerbang & Papan Informasi Real-time (`led-gateway`)**: Fitur visual prestisius penyambutan siswa saat tap kartu di gerbang sekolah.
  3. **Command Center TV Kepala Sekolah (`command-center`)**: Pemantauan live monitoring di ruang eksekutif dan lobi sekolah.
  4. **Teknologi Suara Alami Manusia (*Offline Natural Voice Audio*)**: Sapaan audio ramah ("Selamat Pagi, [Nama]!") yang memotivasi siswa dan guru piket.
  5. **Ketahanan Mode Offline 100% (*Zero Downtime Kiosk Readiness*)**: Sistem gerbang dan terminal tetap berfungsi saat internet seluler atau listrik mati, dengan antrean IndexedDB lokal.
  6. **Pencetakan Kartu & Sinkronisasi Dapodik Otomatis**: Integrasi data resmi Kemendikbudristek tanpa input ulang.
  7. **Segmentasi Persona Manfaat**: Calon pengguna (Kepala Sekolah, Guru Piket, Wali Kelas, Wali Murid, Siswa) belum melihat rangkuman spesifik "Apa Manfaatnya untuk Saya?".

### 1.2. Tujuan (Goals)
1. **Penyelarasan 100% Ekosistem AKSIS**: Mengembangkan showcase landing page dari 5 modul menjadi **7 Modul Layanan Ekosistem Unggulan** yang mencakup Portal Orang Tua, Command Center TV & Display LED Gerbang, di samping Smart ID Card, Presensi IoT, Bank Sampah, Perpustakaan, dan Ekskul.
2. **Penambahan Section Persona Pengguna (User Journey & Stakeholder Benefits)**: Menghadirkan bagian komparatif interaktif yang menjelaskan manfaat konkrit bagi 5 pemangku kepentingan:
   - 👨‍👩‍👧 **Orang Tua / Wali Murid**: Ketenangan hati dengan notifikasi kehadiran gerbang seketika & transparansi perkembangan anak.
   - 👔 **Kepala Sekolah**: Command Center TV monitoring terpusat, prestise sekolah digital, dan data akreditasi Adiwiyata & literasi siap saji.
   - 👨‍🏫 **Guru Piket & Satpam**: Presensi gerbang < 1 detik bebas antrean, bersuara alami, dan tetap beroperasi saat offline.
   - 👩‍🏫 **Wali Kelas & Pembina Ekskul**: Otomatisasi rekap absensi dan nilai predikat e-Rapor siap cetak tanpa rekap manual berjam-jam.
   - 📚 **Pustakawan & Tim Bank Sampah**: Otomatisasi buku tamu perpustakaan dan buku tabungan sampah digital.
3. **Penyajian Arsitektur "Satu Kartu, Tujuh Solusi" (Interactive Ecosystem Architecture Flow)**: Diagram interaktif alur 1 Smart ID Card yang menghubungkan seluruh fasilitas fisik dan portal digital.
4. **Pembaruan Kalkulator Simulasi Multi-Dimensi**: Menambahkan proyeksi transparansi orang tua dan penghematan waktu rekap wali kelas selain metrik waktu gerbang dan sampah terolah.
5. **Mempertahankan Zero-Regression & Lightweight Performance**: Tetap menjaga *dynamic code splitting* (~5-6 kB gzip), loader awal putih bersih (`#ffffff`), dan isolasi CSS `.aksis-landing`.

### 1.3. Batasan Teknis (Constraints)
- Mematuhi aturan EGM: Mode Elephant dilarang mengubah kode sumber sebelum spesifikasi disetujui (**APPROVED**).
- Tidak memecah struktur modular `apps/admin-web/src/landing/` yang telah dibangun, melainkan memperkaya sub-komponen yang telah terisolasi.
- Kompatibilitas responsive penuh dari ponsel layar 360px hingga layar desktop 4K.
- Seluruh unit test (50 file / 256 test cases) dan build monorepo `npm run vercel-build` wajib lulus 100%.

---

## 2. Architecture & Data Flow

### 2.1. Arsitektur Informasi Landing Page Baru

```
┌────────────────────────────────────────────────────────────────────────┐
│ NAVBAR: Logo AKSIS, Nav Links (Fitur, Modul, Ekosistem, Stakeholders,  │
│         Kalkulator, Kontak), Dark Mode Toggle, Tombol Masuk/Dashboard  │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ HERO SECTION: Ambient Glow Orbs, Pill Badge IoT, Headline Utama,       │
│ Subtitle, 4 Metric Highlights (<1 Detik, 100% Dapodik, 7 Modul, 0ms)   │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FITUR UNGGULAN TEKNOLOGI (6 Pilar Fondasi Sistem):                     │
│ 1. Smart ID Card Dapodik       4. Offline-First 7 Hari (IndexedDB)     │
│ 2. Presensi Gerbang & LED      5. Suara Alami Manusia (Natural Voice)  │
│ 3. Portal Orang Tua (PWA)      6. Cloud Terpusat & Enkripsi Data       │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SHOWCASE 7 MODUL EKOSISTEM INTERAKTIF (Tabs + Glassmorphism Window):   │
│ [💳 Smart ID Card] [🚪 Presensi Gerbang] [📱 Portal Orang Tua]         │
│ [♻ Bank Sampah]   [▤ Perpustakaan]      [⭐ Ekskul eRapor]            │
│ [🖥 Command Center & LED]                                               │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAKEHOLDER BENEFIT GRID ("Dirancang untuk Seluruh Warga Sekolah"):    │
│ • Orang Tua Siswa     • Guru Piket & Satpam    • Wali Kelas & Pembina │
│ • Kepala Sekolah      • Pustakawan & Lingkungan• Siswa Sekolah         │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SIMULATOR & KALKULATOR EFISIENSI SEKOLAH (Slider 100 - 3.000 Siswa):   │
│ - Waktu Antrean Gerbang        - Proyeksi Sampah Terolah Adiwiyata     │
│ - Jam Kerja Guru Terselamatkan - Transparansi Notifikasi Orang Tua     │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ KONTAK & KONSULTASI RESMI: WhatsApp Official, Email Cepat, Floating WA │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FOOTER: Sitemap Navigasi, Legalitas, Link Portal Admin, Hak Cipta 2026 │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Modifikasi Data & Tipe Kontrak (`types.ts` & `data.ts`)

#### A. Ekspansi Kunci Modul Showcase:
```typescript
export type ShowcaseModuleKey =
  | "idcard"
  | "presensi"
  | "parent"
  | "sampah"
  | "perpus"
  | "ekskul"
  | "command";
```

#### B. Data Definisi 7 Modul Terpadu:
1. **`idcard` (Smart ID Card Pelajar Terintegrasi)**:
   - Badge: `SATU KARTU SELURUH EKOSISTEM`
   - Icon: `💳`
   - Features: Sinkronisasi Dapodik otomatis, cetak massal/satuan berstandar resmi, barcode unik anti-duplikasi, satu kartu untuk gerbang, kantin/sampah, perpus, dan ekskul.
2. **`presensi` (Presensi Gerbang IoT, LED Display & Suara Alami)**:
   - Badge: `IOT GATE SYSTEM & NATURAL VOICE`
   - Icon: `🚪`
   - Features: Tap presensi <1 detik bebas antrean, display nama siswa di LED Board gerbang, sapaan audio suara manusia, ketahanan offline hingga 7 hari di gerbang.
3. **`parent` (Portal PWA Orang Tua Siswa - Mandiri & Real-Time)**:
   - Badge: `PORTAL KELUARGA & WALI MURID`
   - Icon: `📱`
   - Features: Notifikasi kehadiran masuk & pulang live, transparansi tabungan bank sampah & buku perpustakaan anak, akses instan via NISN + Tanggal Lahir tanpa instal aplikasi app store.
4. **`sampah` (Bank Sampah Edukatif Sekolah Hijau)**:
   - Badge: `ECOLOGICAL WASTE & ADIWIYATA`
   - Icon: `♻`
   - Features: Pencatatan setoran sampah terpilah (plastik, kertas, organik, logam), konversi saldo tabungan siswa otomatis, rekapitulasi data kelas untuk akreditasi Adiwiyata.
5. **`perpus` (Terminal Perpustakaan Digital & Sirkulasi Mandiri)**:
   - Badge: `DIGITAL LIBRARY & LITERACY STATS`
   - Icon: `▤`
   - Features: Presensi kunjungan otomatis via scan kartu menggantikan buku tamu kertas, sirkulasi peminjaman/pengembalian buku kilat, analitik indeks minat baca sekolah.
6. **`ekskul` (Presensi Ekstrakurikuler & Otomatisasi e-Rapor)**:
   - Badge: `EXTRACURRICULAR & RAPOR RECAP`
   - Icon: `⭐`
   - Features: Pencatatan absensi sesi latihan ekskul oleh pembina, kalkulasi persentase kehadiran otomatis, konversi predikat (Sangat Baik/Baik/Cukup/Kurang) siap ekspor ke Wali Kelas.
7. **`command` (Command Center TV Kepala Sekolah & Manajemen IoT)**:
   - Badge: `EXECUTIVE MONITORING & IOT CONSOLE`
   - Icon: `🖥`
   - Features: Tampilan live monitor TV di ruang Kepala Sekolah dan lobi, grafik kehadiran hari ini detik demi detik, indikator status kesehatan terminal & auto-refresh 30 detik.

### 2.3. Komponen Baru: Stakeholder Benefits (`components/stakeholders.ts`)
Komponen baru yang memvisualisasikan matriks nilai tambah per peran:
- 👨‍👩‍👧 **Orang Tua**: Bebas cemas dengan konfirmasi kedatangan anak di sekolah setiap pagi.
- 👨‍🏫 **Guru Piket**: Tugas piket gerbang lebih tertib, cepat, dan modern tanpa buku catatan kertas.
- 👩‍🏫 **Wali Kelas**: Menghemat hingga 40 jam kerja saat musim pengisian rapor tengah & akhir semester.
- 👔 **Kepala Sekolah**: Kendali mutu kedisiplinan dan data akreditasi sekolah terdigitalisasi penuh.

### 2.4. Peningkatan Formula Kalkulator Efisiensi (`components/calculator.ts`)
Input $N \in [100, 3000]$ (siswa):
1. **Waktu Presensi Gerbang**:
   $$T_{\text{waktu}} = \lceil (N \times 0.8) / 60 \rceil \text{ menit total}$$
2. **Proyeksi Sampah Terolah Bulanan**:
   $$W_{\text{sampah}} = \text{round}(N \times 0.3) \text{ kg / bulan}$$
3. **Waktu Kerja Guru & Wali Kelas Terselamatkan**:
   $$H_{\text{jam}} = \text{round}(N \times 0.05) \text{ jam kerja/bulan}$$
   *Penjelasan*: Otomatisasi rekap kehadiran gerbang dan ekskul menghemat rata-rata 3 menit per siswa per bulan bagi para guru dan wali kelas.
4. **Kepuasan & Keterlibatan Orang Tua Siswa**:
   Nilai: `100% Terhubung` (Akses langsung notifikasi kehadiran tanpa batasan kuota SMS).

---

## 3. Edge Cases & Failure Modes

| Skenario Ekstrem | Dampak Potensial | Mitigasi Arsitektural |
| :--- | :--- | :--- |
| **Banyak Tab Showcase (7 Tab) pada Layar HP Sempit** | Tombol tab meluap (*overflow*) atau tumpang tindih secara vertikal di ponsel. | Menggunakan tata letak horizontal scrollable pill bar (`flex-wrap: wrap; justify-content: center; gap: 0.5rem;` pada desktop dan `overflow-x: auto; -webkit-overflow-scrolling: touch;` pada mobile). |
| **Animasi Glowing Orbs pada Ponsel Low-End** | Penurunan frame rate (lag scrolling) pada perangkat spek rendah. | Penambahan `@media (prefers-reduced-motion: reduce)` yang mematikan animasi transform/float, serta optimasi `will-change: transform`. |
| **Kueri Teks Konsultasi WhatsApp Khusus Modul Baru** | Karakter khusus pada judul modul merusak URL WhatsApp API. | Seluruh parameter teks WhatsApp wajib dilewatkan melalui `encodeURIComponent()`. |
| **Perbedaan Tampilan Tema Gelap pada Komponen Baru Stakeholders** | Kartu stakeholder tidak kontras saat dark mode aktif. | Deklarasi eksplisit `background: var(--surface)`, `border: 1px solid var(--line)`, dan warna teks `var(--text)` / `var(--muted)`. |

---

## 4. Step-by-Step Implementation Plan

### Fase 1: Pembaruan Data & Tipe Ekosistem
- [ ] **Langkah 1.1**: Memperbarui `apps/admin-web/src/landing/types.ts` dengan penambahan kunci modul `parent` dan `command`.
- [ ] **Langkah 1.2**: Memperbarui `apps/admin-web/src/landing/data.ts` dengan 7 modul lengkap beserta data pendukungnya.

### Fase 2: Peningkatan Komponen Tampilan
- [ ] **Langkah 2.1**: Memperbarui `apps/admin-web/src/landing/components/hero.ts` untuk menonjolkan integrasi 7 modul dan 10 aplikasi ekosistem.
- [ ] **Langkah 2.2**: Memperbarui `apps/admin-web/src/landing/components/features.ts` dengan 6 pilar teknologi (termasuk Offline-first, Natural Voice, Portal Orang Tua).
- [ ] **Langkah 2.3**: Memperbarui `apps/admin-web/src/landing/components/showcase.ts` agar mendukung 7 tab modul interaktif secara responsif.
- [ ] **Langkah 2.4**: Membuat komponen baru `apps/admin-web/src/landing/components/stakeholders.ts` ("Dirancang untuk Seluruh Warga Sekolah").
- [ ] **Langkah 2.5**: Memperbarui `apps/admin-web/src/landing/components/calculator.ts` dengan kalkulasi 4 metrik efisiensi terpadu.
- [ ] **Langkah 2.6**: Memperbarui `apps/admin-web/src/landing/landing.css` untuk styling stakeholder grid dan tab scroll responsif.
- [ ] **Langkah 2.7**: Mengintegrasikan seluruh komponen baru ke dalam `apps/admin-web/src/landing/index.ts`.

### Fase 3: Pengujian & Validasi Mutu
- [ ] **Langkah 3.1**: Menjalankan `npm run typecheck:all` memastikan kompatibilitas TypeScript monorepo.
- [ ] **Langkah 3.2**: Menjalankan `npm test` memverifikasi seluruh 50 test suite / 256 test cases lulus.
- [ ] **Langkah 3.3**: Menjalankan `npm run build:admin` dan memastikan ukuran chunk tetap teroptimasi (< 10 kB gzip).
- [ ] **Langkah 3.4**: Menjalankan `npm run vercel-build` memastikan kelulusan packaging monorepo.

### Fase 4: Deployment & Verifikasi Produksi
- [ ] **Langkah 4.1**: Membuat Git commit terstruktur dan push ke `origin/main`.
- [ ] **Langkah 4.2**: Deployment ke Vercel production (`aksis` di `netkom-developers-projects`).
- [ ] **Langkah 4.3**: Verifikasi langsung pada `https://www.aksis.co.id`.
- [ ] **Langkah 4.4**: Mendokumentasikan laporan pengujian di `docs/`.

---

## 5. Kriteria Penerimaan (Checklist Verifikasi)
- [ ] 7 Modul Ekosistem tampil lengkap di landing page (Smart ID Card, Presensi Gerbang IoT, Portal Orang Tua, Bank Sampah, Perpustakaan, Ekskul, Command Center & LED).
- [ ] Fitur-fitur unggulan AKSIS (Offline-First 7 hari, Suara Alami Manusia, PWA tanpa download app store, sinkronisasi Dapodik) dijelaskan secara lugas dan memikat.
- [ ] Matriks manfaat untuk 5 pemangku kepentingan sekolah ditampilkan dalam grid responsif.
- [ ] Slider kalkulator efisiensi menyajikan proyeksi waktu gerbang, sampah terolah, dan penghematan jam kerja guru.
- [ ] Tampilan responsif pada ponsel (360px) tanpa layout overflow.
- [ ] Dark mode dan light mode transisi dengan mulus.
- [ ] Seluruh unit test dan build monorepo lulus 100%.
