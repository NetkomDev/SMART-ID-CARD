# Laporan Modernisasi & Optimasi Landing Page AKSIS (aksis.co.id) - 2026-11-03

## 1. Ringkasan Eksekutif
Telah dilaksanakan implementasi perombakan arsitektur, modularisasi, dan optimasi performa pada **Landing Page Utama AKSIS** (`www.aksis.co.id`) berdasarkan spesifikasi teknis yang telah disetujui (**APPROVED**) di [docs/specs/landingpage.md](file:///Users/berech/Documents/Smart%20ID%20Card/AKSIS.CO.ID/docs/specs/landingpage.md).

Pembaruan ini menuntaskan 4 isu utama:
1. **Dynamic Code Splitting**: Memisahkan bundle landing page dari kode dashboard admin. Pengunjung publik kini hanya mengunduh chunk JavaScript landing berukuran **~5.87 kB (gzip)**, tanpa memuat dependensi berat admin (>300 kB).
2. **Eliminasi Flash of Dark Content (FODC)**: Menyelaraskan warna latar loader awal di `index.html` menjadi `#ffffff` (putih bersih) dengan ring spinner hijau zamrud, menghilangkan lonjakan warna saat cold start.
3. **Modularisasi Komponen Bersih**: Memecah berkas monolitik `landing.ts` (479 baris) ke dalam direktori terstruktur `apps/admin-web/src/landing/` dengan sub-komponen terisolasi (`header`, `hero`, `features`, `showcase`, `calculator`, `contact`, `footer`) serta CSS ter-scope di bawah `.aksis-landing`.
4. **Perlindungan Race Condition & Formula Matematis**: Menambahkan proteksi `renderToken` pada asynchronous dynamic import dan formula matematis kalkulator efisiensi sekolah yang presisi.

---

## 2. Rincian Modifikasi Arsitektur

### A. Modularisasi Komponen (`apps/admin-web/src/landing/`)
- `index.ts`: Orkesrator utama yang merakit antarmuka landing page di bawah kontainer `.aksis-landing` dan memicu event listener.
- `types.ts`: Definisi tipe data `ShowcaseModule`, `ShowcaseModuleKey`, dan `ComponentMountContext`.
- `data.ts`: Data konten terstruktur untuk 5 modul layanan AKSIS (Smart ID Card, Presensi IoT & LED, Bank Sampah, Perpustakaan, Ekskul & eRapor).
- `components/header.ts`: Navbar adaptif, logo resmi, link navigasi smooth scroll, tombol toggle tema (*dark/light*), dan tombol aksi Masuk/Dashboard.
- `components/hero.ts`: Hero section modern dengan ambient glowing orbs, badge IoT, judul gradien, dan metric card bar responsif.
- `components/features.ts`: Grid 6 fitur utama dan 3 pilar keunggulan manajemen sekolah.
- `components/showcase.ts`: Tab interaktif 5 modul dengan preview glassmorphism window dan CTA dinamis WhatsApp konsultasi modul.
- `components/calculator.ts`: Simulator efisiensi dengan formula matematis eksplisit:
  - Waktu presensi gerbang: $T_{\text{menit}} = \lceil (N \times 0.8) / 60 \rceil$
  - Sampah terolah: $W_{\text{kg}} = \text{round}(N \times 0.3)$
- `components/contact.ts`: Kartu kontak WhatsApp resmi (+62 856-9448-8510), email konsultasi, dan floating action button WhatsApp.
- `components/footer.ts`: Footer sitemap dan informasi legal platform.
- `landing.css`: Seluruh aturan styling landing page diisolasi di bawah selektor induk `.aksis-landing`.
- **Penghapusan Berkas Monolitik Lama**: `apps/admin-web/src/landing.ts` dihapus permanen untuk mencegah konflik modul resolusi Vite.

### B. Dynamic Code Splitting & Race Condition Guard (`apps/admin-web/src/app.ts`)
- Menghapus impor statis `landing.ts`.
- Mengimplementasikan `await import("./landing")` pada rute publik dan `/landing`.
- Menambahkan generasi `renderToken` untuk membatalkan render modul landing jika pengguna melakukan navigasi cepat ke rute lain saat modul sedang diunduh.

### C. SEO & Loader Putih Bersih (`apps/admin-web/index.html`)
- Mengganti tema loader awal dari hijau tua pekat (`#172d28`) menjadi putih bersih (`#ffffff`).
- Menambahkan Open Graph image, canonical URL, Twitter Cards, dan JSON-LD Structured Data (`Organization` & `SoftwareApplication`).

---

## 3. Hasil Pengujian & Verifikasi Mutu
- **TypeScript Compiler**: `npm run typecheck:all` -> Seluruh 11 modul monorepo lulus tanpa error tipe.
- **Unit Testing**: `npm test` -> 50 test suite (256 pengujian) lulus 100%.
- **Vite Build**:
  - `dist/assets/index-MEaZx5XX.js`: **20.20 kB** (gzip: **5.87 kB**) -> Chunk landing page publik terpisah murni.
  - `dist/assets/index-AEKOcFAg.css`: **14.35 kB** (gzip: **3.10 kB**) -> Chunk CSS landing page terpisah murni.
- **Monorepo Packaging**: `npm run vercel-build` -> Berhasil mengemas 10 entrypoint portal ke `dist/`.
