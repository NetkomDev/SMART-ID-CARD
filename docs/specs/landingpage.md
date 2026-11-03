# Spesifikasi Desain Arsitektur: Modernisasi & Optimasi Landing Page AKSIS (aksis.co.id)

- **ID Dokumen:** `SPEC-EGM-LANDING-001`
- **Target File:** `docs/specs/landingpage.md`
- **Status:** `APPROVED`
- **Penyusun:** Mode Elephant (Arsitek & Perencana)
- **Repositori:** `NetkomDev/SMART-ID-CARD` (`www.aksis.co.id`)
- **Tanggal Revisi:** 2026-11-03

---

## 1. Context & Goals

### 1.1. Latar Belakang & Masalah
Saat ini, domain utama `www.aksis.co.id` berfungsi ganda sebagai:
1. **Landing Page Publik**: Menampilkan profil ekosistem sekolah cerdas (*Smart School Ecosystem*), fitur Smart ID Card, integrasi IoT gerbang, bank sampah, perpustakaan, ekskul, kalkulator efisiensi, dan narahubung resmi bagi calon mitra/sekolah.
2. **Portal Administrasi Terpusat (`admin-web`)**: Mengelola data induk sekolah, akun guru/staf, pemantauan terminal, dan dashboard kepala sekolah.

Berdasarkan audit arsitektur pada `apps/admin-web/src/landing.ts`, `apps/admin-web/src/app.ts`, dan `apps/admin-web/index.html`, ditemukan beberapa kelemahan struktural:
- **Throughput & Bundle Bloat**: Landing page saat ini di-*bundle* secara monolitik menjadi satu kesatuan dengan seluruh kode admin (`app.ts`, `xlsx`, `qrcode`, klien Supabase, pustaka grafik). Pengunjung umum yang hanya ingin melihat profil produk diwajibkan mengunduh bundle JavaScript admin (~300–800 kB), sehingga memperlambat metrik *First Contentful Paint* (FCP) dan *Largest Contentful Paint* (LCP).
- **Initial Flash of Dark Content (FODC)**: `index.html` mendefinisikan loader awal inline bertema hijau tua gelap (`#172d28` / radial-gradient `#1c3a34`), sedangkan antarmuka landing page default bertema terang (*light theme* dengan aksen hijau toska dan lime lembut). Hal ini menimbulkan kedipan visual (*visual jarring*) saat pertama kali dibuka.
- **Keterbatasan SEO & Prerendering**: Konten landing page seluruhnya dirender secara imperatif melalui manipulasi DOM JavaScript (`renderLandingPage()` di `landing.ts`). Mesin pencari atau bot *web crawler* yang tidak mengeksekusi JavaScript kompleks hanya melihat elemen `<div id="app"><div class="aksis-initial-loader">...</div></div>`.
- **Kerapian Arsitektur & Modularitas**: Berkas lama `apps/admin-web/src/landing.ts` menggabungkan definisi data showcase, markup HTML string berukuran besar (479 baris), kalkulator logika, dan event listener dalam satu berkas monolitik tanpa pemisahan komponen dan styling terisolasi.

### 1.2. Tujuan (Goals)
1. **0ms Blank Screen & Instant FCP**: Menyelaraskan warna latar loader awal dengan tema default landing page (`#ffffff` / *soft light* dengan aksen hijau toska).
2. **Pemisahan Bundle & Code Splitting**: Memisahkan modul landing page dari modul inti admin dashboard melalui *dynamic import* (`import("./landing")`), sehingga pengunjung umum tidak mengunduh modul Excel, scanner, atau dashboard admin.
3. **SEO & Structured Data Kelas Enterprise**: Menambahkan metadata Open Graph lengkap, Twitter Cards, kanonikal URL, serta JSON-LD schema (`SoftwareApplication`, `Organization`, dan `FAQPage`) untuk dominasi kata kunci ID Card Siswa, Presensi IoT, dan Smart School di Google Indonesia.
4. **Peningkatan Pengalaman Visual (UI/UX) Sesuai Desain Produksi**:
   - Mempertahankan dan memoles estetika premium yang sudah ada: Top Navbar responsif, Glassmorphism Hero Section, Pill Badge IoT, Showcase Tab Interaktif (5 modul), Kalkulator Simulasi Efisiensi, Kartu Kontak WhatsApp/Email, dan Floating WhatsApp CTA.
   - Peningkatan responsivitas pada perangkat seluler (iPhone/Android) dengan tipografi fluid (`clamp()`).
5. **Dukungan Dark Mode Mulus**: Transisi pergantian tema (*dark/light mode*) tanpa *layout shift* atau *color flash*, tersimpan secara persisten di `localStorage`.

### 1.3. Batasan Teknis (Constraints)
- Wajib mematuhi protokol EGM: Dokumen spesifikasi harus berstatus **APPROVED** oleh Goldfish sebelum implementor mulai menulis kode.
- Single Domain Deployment: Landing page dan aplikasi admin tetap dilayani secara mulus pada domain produksi `www.aksis.co.id` di Vercel tanpa merusak *routing* portal PWA lainnya (`/parent`, `/attendance`, `/library`, `/waste`, `/extracurricular`, `/led`).
- Zero Regressions: Unit test monorepo (50 test suite / 256 test cases) dan build `npm run vercel-build` harus tetap lulus 100%.

---

## 2. Architecture & Data Flow

### 2.1. Arsitektur Komponen & Routing Terkoreksi

#### Diagram Alur Pengunjung (Visitor Flow):
```
[Pengunjung Mengakses aksis.co.id]
               │
               ▼
   [Vercel Edge Rewrite -> /index.html]
               │
               ▼
 ┌──────────────────────────────────────────────┐
 │ Inline Head: Meta SEO + Theme Sniffer +     │
 │ Pre-render Shell / White Skeleton Loader     │
 └──────────────────────┬───────────────────────┘
                        │
                        ▼
                [app.ts: render()]
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
   [Belum Login]                  [Sudah Login]
         │                             │
         ▼                             ▼
[Dynamic Import:              [Load Admin Dashboard Core:
 ./landing/index.ts (~25kB)]   app.ts dashboard logic (>300kB)]
         │                             │
         ▼                             ▼
 [Render Landing Page]          [Render Dashboard Admin]
```

> **Catatan Koreksi Entrypoint**: `apps/admin-web/src/main.ts` bertindak murni sebagai loader bootstrap (`import "./styles.css"; void render();`). Seluruh logika penentuan rute dan percabangan tampilan dieksekusi oleh fungsi `render()` di dalam `apps/admin-web/src/app.ts`.

### 2.2. Resolusi Modul & Struktur Berkas (Penyelesaian BLOCKER)

#### Langkah Migrasi Berkas yang Eksplisit:
Untuk mencegah konflik modul resolusi TypeScript/Vite (*ambiguous module resolution* antara file `src/landing.ts` dan folder `src/landing/index.ts` saat pemanggilan `import("./landing")`):
1. Seluruh sub-komponen baru dibuat di dalam direktori `apps/admin-web/src/landing/`.
2. Entrypoint direktori dibuat pada `apps/admin-web/src/landing/index.ts`.
3. Berkas monolitik lama `apps/admin-web/src/landing.ts` **dihapus secara permanen** (`git rm apps/admin-web/src/landing.ts`) sehingga bundler Vite secara deterministik menyelesaikan `import("./landing")` ke `apps/admin-web/src/landing/index.ts`.

#### Struktur Berkas Direktori Baru:
```
apps/admin-web/src/landing/
├── index.ts               # Entrypoint modul landing page & orchestration
├── types.ts               # Tipe data showcase, modul, dan konfigurasi kontak
├── data.ts                # Data statis 5 modul (idcard, presensi, sampah, perpus, ekskul)
├── landing.css            # Styling khusus terisolasi di bawah selektor .aksis-landing
└── components/
    ├── header.ts          # Navbar, brand logo, menu navigasi, & theme toggle
    ├── hero.ts            # Hero headline, glowing orbs, badge IoT, & metric bar
    ├── features.ts        # Grid 6 pilar keunggulan sistem
    ├── showcase.ts        # Tab interaktif 5 modul & mockup glass visual
    ├── calculator.ts      # Slider kalkulator efisiensi siswa & formula matematis
    ├── contact.ts         # Section kontak WhatsApp, Email, & Floating WA button
    └── footer.ts          # Footer sitemap, hak cipta, & link portal admin
```

### 2.3. Pencegahan Race Condition pada Asynchronous Dynamic Import (Penyelesaian BLOCKER)

Ketika memuat modul `landing` secara dinamis (`await import("./landing")`), terdapat potensi *race condition* jika pengguna mengklik navigasi dengan cepat (misal ke `/login`) atau terjadi perubahan status autentikasi sebelum *promise* dynamic import selesai.

Untuk mencegah tampilan landing page menimpa halaman login atau dashboard yang sedang dibuka, `app.ts` mengimplementasikan token generasi render (`renderToken`):

```typescript
// apps/admin-web/src/app.ts
let currentRenderToken = 0;

export async function render(): Promise<void> {
  const renderToken = ++currentRenderToken;
  clearDashboard(); 
  disposeNavigation?.(); 
  disposeNavigation = undefined;

  try {
    const currentPath = location.pathname;

    // Public / Unauthenticated routing
    if (!getSession()) {
      if (currentPath === "/login") {
        loginView();
        return;
      }
      
      try {
        const { renderLandingPage } = await import("./landing");
        // Batalkan jika generasi render sudah usang (terjadi navigasi lain)
        if (renderToken !== currentRenderToken) return;
        renderLandingPage(navigate);
      } catch (err) {
        if (renderToken !== currentRenderToken) return;
        // Fallback UI jika koneksi gagal mengunduh modul landing
        const app = getApp();
        app.innerHTML = `
          <div class="landing-error-state">
            <p>Gagal memuat halaman. Silakan periksa koneksi internet Anda.</p>
            <button onclick="location.reload()" class="button primary">Muat Ulang</button>
          </div>
        `;
      }
      return;
    }

    // Jika sudah login dan mengunjungi /landing secara eksplisit
    if (currentPath === "/landing") {
      const { renderLandingPage } = await import("./landing");
      if (renderToken !== currentRenderToken) return;
      renderLandingPage(navigate);
      return;
    }

    // ... Logika bootstrap & routing dashboard admin yang sudah ada ...
  } catch (error) {
    if (renderToken !== currentRenderToken) return;
    // Error handling shell admin
  }
}
```

### 2.4. Kontrak Antarmuka Komponen (Component Interface Contracts)

Setiap sub-komponen pada `apps/admin-web/src/landing/components/` mematuhi pola kontrak standar dua tahap:
1. `render*`: Mengembalikan string HTML murni (*pure template string*).
2. `mount*`: Mengikat event listener interaktif ke elemen DOM yang telah dirender.

#### Signature Masing-Masing Komponen:

```typescript
// types.ts
export interface ComponentMountContext {
  container: HTMLElement;
  navigate: (path: string) => void;
}

// components/header.ts
export function renderHeader(isLoggedIn: boolean): string;
export function mountHeader(context: ComponentMountContext): void;

// components/hero.ts
export function renderHero(): string;

// components/features.ts
export function renderFeatures(): string;

// components/showcase.ts
export function renderShowcase(activeTabKey?: string): string;
export function mountShowcase(context: ComponentMountContext): void;

// components/calculator.ts
export function renderCalculator(initialStudents?: number): string;
export function mountCalculator(container: HTMLElement): void;

// components/contact.ts
export function renderContact(): string;
export function renderFloatingWhatsApp(): string;

// components/footer.ts
export function renderFooter(): string;
export function mountFooter(context: ComponentMountContext): void;
```

### 2.5. Formula Matematis Kalkulator Efisiensi (`calculator.ts`)

Kalkulator efisiensi sekolah pada `components/calculator.ts` mengimplementasikan parameter dan formula matematis terdefinisi berikut:

1. **Parameter Input**:
   - $N$: Jumlah Siswa Sekolah.
   - Tipe data: Integer.
   - Batasan Slider: $100 \le N \le 3000$, dengan kenaikan (*step*) sebesar $50$.
   - Nilai awal (*default*): $N = 750$.

2. **Formula Perhitungan Output**:
   - **Waktu Presensi Gerbang Harian ($T_{\text{waktu}}$)**:
     $$T_{\text{menit}} = \left\lceil \frac{N \times 0.8}{60} \right\rceil$$
     *Penjelasan*: Rata-rata kecepatan tap gerbang IoT adalah 0.8 detik/siswa. Total detik dibagi 60 detik/menit lalu dibulatkan ke atas.
     *Tampilan Label*: `< ${T_menit} Menit Total`
     *Subteks*: `Menghemat ~2 jam antrean manual setiap pagi`

   - **Proyeksi Setoran Sampah Terolah ($W_{\text{sampah}}$)**:
     $$W_{\text{kg}} = \text{round}(N \times 0.3)$$
     *Penjelasan*: Rata-rata setoran sampah daur ulang edukatif adalah 0.3 kg per siswa per bulan.
     *Tampilan Label*: `~ ${W_kg.toLocaleString("id-ID")} Kg / Bulan`
     *Subteks*: `Edukasi lingkungan bagi seluruh siswa sekolah`

   - **Efisiensi Rekap Laporan Rapor Wali Kelas**:
     *Nilai Output*: `100% Otomatis`
     *Subteks*: `Presensi & Predikat Ekskul siap cetak/export CSV`

### 2.6. Isolasi & Scoping CSS (`landing.css`)

Untuk mencegah kebocoran CSS (*style bleeding*) antara landing page publik dan dashboard admin:
1. Seluruh markup landing page di `index.ts` dibungkus dalam elemen induk: `<div class="aksis-landing" id="main-content"> ... </div>`.
2. Seluruh aturan CSS pada `landing.css` wajib diawali dengan selektor induk `.aksis-landing`:
   ```css
   .aksis-landing {
     /* CSS Variables khusus landing page */
     --landing-surface: #ffffff;
     --landing-ink: #0f172a;
     --landing-primary: #059669;
     --landing-accent: #10b981;
     /* ... */
   }

   .aksis-landing .landing-header { /* ... */ }
   .aksis-landing .landing-hero { /* ... */ }
   .aksis-landing .feature-card { /* ... */ }
   .aksis-landing .showcase-tabs { /* ... */ }
   .aksis-landing .calculator-card { /* ... */ }
   .aksis-landing .contact-card { /* ... */ }
   .aksis-landing .floating-wa-btn { /* ... */ }
   .aksis-landing .landing-footer { /* ... */ }
   ```
3. Aturan global `apps/admin-web/src/styles.css` yang sebelumnya mendefinisikan `.landing-*` akan dibersihkan dan dipindahkan seutuhnya ke `landing.css`.

### 2.7. Metadata SEO & JSON-LD Structured Data

Pada `apps/admin-web/index.html`:
- Loader awal inline disetel ke `#ffffff` (putih bersih) dengan ring spinner hijau zamrud (`#059669`).
- Ditambahkan deklarasi JSON-LD skema resmi:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.aksis.co.id/#organization",
      "name": "AKSIS Platform",
      "url": "https://www.aksis.co.id",
      "logo": "https://www.aksis.co.id/logo.png",
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+62-856-9448-8510",
        "contactType": "customer service",
        "areaServed": "ID",
        "availableLanguage": ["Indonesian"]
      }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.aksis.co.id/#software",
      "name": "AKSIS Smart School Ecosystem",
      "operatingSystem": "All",
      "applicationCategory": "EducationalApplication",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "IDR"
      }
    }
  ]
}
</script>
```

---

## 3. Edge Cases & Failure Modes

### 3.1. Penanganan Skenario Gagal & Batasan Sistem

| Skenario / Kasus Ekstrem | Potensi Masalah | Solusi Mitigasi Arsitektural |
| :--- | :--- | :--- |
| **Koneksi Lemah / Timeout saat Dynamic Import** | Gagal mengunduh bundle `landing` melalui jaringan seluler buruk. | Blok `try/catch` pada `await import("./landing")` menangkap error dan merender *retry card* interaktif tanpa merusak state window. |
| **Race Condition Pergantian Halaman Cepat** | Pengguna berpindah ke `/login` sebelum dynamic import `landing` selesai diunduh. | Pengecekan token render `if (renderToken !== currentRenderToken) return;` membatalkan render modul yang sudah usang. |
| **Konflik Resolusi Berkas Lama vs Baru** | Vite/TypeScript bingung memilih antara `landing.ts` dan `landing/index.ts`. | Langkah migrasi mewajibkan penghapusan berkas `landing.ts` monolitik lama sebelum kompilasi. |
| **Pengguna Mengubah Preferensi Sistem OS (Dark Mode)** | Terjadi konflik antara tema tersimpan di `localStorage` dengan preferensi sistem OS. | Script inline di `<head>` memprioritaskan `localStorage.getItem("aksis-theme")`, lalu jatuh ke `window.matchMedia("(prefers-color-scheme: dark)")`. |
| **Sesi Token Kedaluwarsa saat Navigasi** | Pengguna yang sebelumnya login membuka tab baru di `/` saat token auth sudah tidak valid. | Fungsi autentikasi memeriksa validitas sesi; jika token invalid, otomatis membersihkan sesi lokal (`clearSession()`) dan merender landing page publik secara aman tanpa crash. |
| **Hash Anchor Scrolling pada Single Page App (SPA)** | Klik menu navigasi (`#fitur`, `#modul`, dll.) bisa menabrak router browser SPA. | Event delegation khusus untuk tautan anchor `a[href^="#"]` dengan `e.preventDefault()` dan `element.scrollIntoView({ behavior: "smooth", block: "start" })`. |
| **Perangkat Mobile Layar Sempit (< 360px)** | Metric bar di hero section terpotong atau tumpang tindih. | Menggunakan CSS Grid fleksibel dengan `grid-template-columns: repeat(auto-fit, minmax(130px, 1fr))` dan penyesuaian padding kartu metrik. |
| **Blokir Pop-up atau WhatsApp Client Tidak Terpasang** | Klik tombol WhatsApp di desktop tanpa aplikasi desktop WA. | URL diformat menggunakan standar universal `https://wa.me/6285694488510?text=...` dengan atribut `target="_blank"` dan `rel="noopener noreferrer"`. |

---

## 4. Step-by-Step Implementation Plan

Berikut urutan langkah kerja teknis yang akan dieksekusi oleh Implementor setelah dokumen spesifikasi ini disetujui (**APPROVED**):

### Fase 1: Penataan Komponen & Modularisasi Landing Page
- [ ] **Langkah 1.1**: Membuat direktori `apps/admin-web/src/landing/` beserta sub-berkas `types.ts`, `data.ts`, dan modul komponen (`header.ts`, `hero.ts`, `features.ts`, `showcase.ts`, `calculator.ts`, `contact.ts`, `footer.ts`).
- [ ] **Langkah 1.2**: Membuat styling terisolasi di `apps/admin-web/src/landing/landing.css` dengan scoping di bawah `.aksis-landing`.
- [ ] **Langkah 1.3**: Mengimplementasikan `apps/admin-web/src/landing/index.ts` sebagai agregator orkestrasi perakitan antarmuka dan event binding.
- [ ] **Langkah 1.4 (Penyelesaian BLOCKER Modul)**: Menghapus berkas monolitik lama `apps/admin-web/src/landing.ts` untuk memastikan tidak ada konflik resolusi modul Vite/TypeScript.

### Fase 2: Optimasi Dynamic Import, Race Condition Guard & SEO
- [ ] **Langkah 2.1 (Penyelesaian BLOCKER Race Condition)**: Memperbarui fungsi `render()` pada `apps/admin-web/src/app.ts` untuk memuat landing page secara dinamis (`await import("./landing")`) dengan proteksi `renderToken` dan error fallback.
- [ ] **Langkah 2.2**: Memperbarui inline style `<style>` dan elemen loader di `apps/admin-web/index.html` agar menggunakan latar belakang `#ffffff` (putih bersih) dengan spinner hijau zamrud.
- [ ] **Langkah 2.3**: Menambahkan metadata Open Graph, Twitter Cards, dan JSON-LD schema di `apps/admin-web/index.html`.

### Fase 3: Pengujian & Validasi Mutu
- [ ] **Langkah 3.1 (Typecheck)**: Menjalankan `npm run typecheck:all` untuk memastikan tidak ada kesalahan tipe TypeScript di seluruh monorepo.
- [ ] **Langkah 3.2 (Unit Test)**: Menjalankan `npm test` untuk memverifikasi 50 test suite / 256 unit test tetap lulus tanpa regresi.
- [ ] **Langkah 3.3 (Build)**: Menjalankan `npm run build:admin` dan memverifikasi penurunan ukuran bundle awal untuk landing page.
- [ ] **Langkah 3.4 (Packaging)**: Menjalankan `npm run vercel-build` untuk memvalidasi keberhasilan kompilasi seluruh portal monorepo.

### Fase 4: Deployment & Verifikasi Produksi (Sesuai AGENTS.md)
- [ ] **Langkah 4.1**: Membuat Git commit terstruktur dan melakukan push ke `origin/main`.
- [ ] **Langkah 4.2**: Melakukan deployment ke Vercel production (`aksis` di `netkom-developers-projects`).
- [ ] **Langkah 4.3**: Melakukan verifikasi langsung pada `https://www.aksis.co.id` (memeriksa HTTP 200, respon HTML, dynamic code splitting, dan tampilan visual).
- [ ] **Langkah 4.4**: Menyusun laporan dokumentasi hasil pembaruan di direktori `docs/`.

---

## 5. Kriteria Penerimaan (Checklist Verifikasi)
- [ ] Akses langsung ke `https://www.aksis.co.id` menampilkan landing page modern dengan latar belakang bersih tanpa kedipan hijau tua (*no dark flash*).
- [ ] Bundle JavaScript awal untuk halaman publik terpisah secara dinamis dari bundle dashboard admin.
- [ ] Tidak ada konflik resolusi antara `landing.ts` dan `landing/index.ts`.
- [ ] Race condition saat perpindahan rute asinkron terproteksi via `renderToken`.
- [ ] Tab interaktif 5 modul (Smart ID Card, Presensi Gerbang IoT & LED, Bank Sampah Edukatif, Terminal Perpustakaan, Rekapitulasi Ekskul & eRapor) berfungsi mulus.
- [ ] Slider simulasi kalkulator efisiensi merespons input geser siswa secara instan sesuai formula matematis $T_{\text{menit}} = \lceil (N \times 0.8) / 60 \rceil$ dan $W_{\text{kg}} = \text{round}(N \times 0.3)$.
- [ ] Seluruh CSS landing page terisolasi di bawah `.aksis-landing` tanpa kebocoran gaya ke portal admin.
- [ ] Tombol tema (Dark/Light mode) bekerja konsisten dan menyimpan preferensi ke `localStorage`.
- [ ] Floating button WhatsApp dan kartu kontak terhubung langsung ke `+62 856-9448-8510`.
- [ ] Seluruh unit test (50 file / 256 test cases) lulus tanpa error.
