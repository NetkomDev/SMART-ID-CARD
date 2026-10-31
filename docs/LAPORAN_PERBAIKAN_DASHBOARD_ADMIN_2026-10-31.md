# Laporan Perbaikan dan Redesain Dashboard Admin Sekolah

Tanggal: 31 Oktober 2026, WITA.

## Sasaran Perbaikan

Berdasarkan permintaan pemilik:
1. **Redesain Sidebar:** Sidebar modern dengan auto show/hide (expand/collapse) saat disorot kursor mouse (*hover*) atau fokus keyboard.
2. **Ikon Menu Relevan & Proporsional:** Ikon menu SVG seragam dan proporsional (22px) yang tampil ideal baik dalam keadaan collapsed (rail) maupun expanded.
3. **Penataan Isi Halaman Presisi:** Setiap halaman/menu menyesuaikan ukuran tampilan secara presisi di berbagai resolusi layar tanpa horizontal scroll overflow.
4. **Optimasi Performa Interkoneksi Database/Supabase:** Konten tampil instan saat navigasi antar menu dengan in-memory cache, penggabungan bootstrap query, pembersihan query tidak perlu, dan lazy-loading modul berat.

---

## Rincian Perbaikan yang Diterapkan

| Komponen | Implementasi & Hasil |
| --- | --- |
| **Sidebar Desktop** | Didesain dengan mode rail (lebar tetap 76px) yang melebar secara halus (*expand* ke 260px) saat disorot kursor mouse (`:hover`) atau saat menerima fokus navigasi keyboard (`:focus-within`). |
| **Stabilitas Workspace** | Sidebar melebar di atas lapisan konten (*overlay flyout*) tanpa mendorong, mengecilkan, atau mengubah posisi `left` dari area kerja/workspace utama (tetap presisi 76px). |
| **Ikon Menu** | Mengganti campuran simbol dan emoji dengan ikon SVG vektor modern berukuran konsisten 22x22px yang terpusat rapi di rail collapsed dan berdampingan serasi dengan label teks saat expanded. |
| **Sidebar Mobile (< 768px)** | Di layar ponsel dan tablet kecil, sidebar disembunyikan sebagai off-canvas drawer yang dapat dibuka via tombol menu burger dan ditutup kembali via tombol `Escape` atau backdrop click. |
| **Presisi Layout Konten** | Grid layout pada seluruh 12 rute menu ditata ulang secara responsif (multi-kolom fleksibel di desktop, 1 kolom di tablet portrait dan mobile). Tidak ada kebocoran horizontal scroll (`scrollWidth <= viewportWidth`). |
| **In-Memory Read Cache** | Menambahkan mekanisme `read-cache` singkat di memori klien dengan pemisahan per sesi akun dan sekolah aktif. Navigasi kembali ke menu yang baru saja dibuka berlangsung instan (~150 ms) tanpa request jaringan tambahan. |
| **Invalidasi Mutasi Data** | Setiap aksi mutasi (tambah, edit, simpan, atau hapus) secara otomatis membersihkan cache terkait sehingga data di layar selalu sinkron dengan database Supabase. |
| **Penggabungan Bootstrap Query** | Data sekolah aktif dan konteks izin/hak akses digabungkan langsung dalam satu endpoint `/schools/current`, menghemat 1 round-trip HTTP di awal pemuatan. |
| **Optimasi Halaman QR Portal** | Menghapus permintaan pengunduhan seluruh roster data siswa di halaman `/pwa-portals` yang sebelumnya memperlambat loading. |
| **Pencegahan Race Condition Pencarian** | Query pencarian input teks kini dilengkapi request sequencing; respons pencarian lama yang tertunda tidak akan menimpa hasil ketikan terbaru pengguna. |
| **Code-Splitting Modul Excel** | Library spreadsheet (`xlsx`) berukuran ~500 KB dikeluarkan dari bundle utama dan hanya dimuat secara on-demand (*lazy loaded*) ketika admin mengklik tombol download template / ekspor. |

---

## Hasil Pengujian & Verifikasi

### 1. Unit & Integration Tests
- **Vitest Suite:** 42 test files lulus 100% (207 tests passed).
- Pengujian mencakup permission checking, modal konfirmasi, library charts, read cache invalidation, API proxy routes, dan skema validasi.

### 2. Multi-App Typecheck
- Seluruh 10 aplikasi monorepo lulus typecheck tanpa error (`npm run typecheck:all`):
  - `api`, `admin-web`, `parent-pwa`, `waste-pwa`, `extracurricular-pwa`, `library-terminal`, `led-gateway`, `command-center`, `card-writer`, `operations-console`.

### 3. Automated Browser Testing (Puppeteer)
Pengujian otomatis end-to-end dengan `node tooling/test-admin-workspace.mjs` diuji pada browser Chrome headless:
- **Pengujian Sidebar Hover:**
  - Collapsed rail width: tepat 76px.
  - Expanded width saat hover: > 256px.
  - Workspace horizontal offset: tidak berubah sebelum dan sesudah hover (stabil di 76px).
  - SVG icon dimensions: terverifikasi 22x22px merata di seluruh menu.
- **Pengujian Responsif 12 Rute Menu:**
  - Rute yang diuji: `/`, `/students`, `/academic-years`, `/devices`, `/cards`, `/pwa-portals`, `/attendance`, `/reports`, `/waste`, `/library`, `/extracurricular`, `/led`.
  - Resolusi layar yang diuji: 1920x1080, 1440x900, 1280x720, 1024x600, 768x1024, 600x960, 390x844, 320x740.
  - Hasil: `scrollWidth <= viewportWidth` pada semua rute dan resolusi (bebas horizontal overflow).
- **Pengujian Kecepatan & Navigasi:**
  - Waktu kembali ke `/students`: ~156 ms dengan 0 network request tambahan.
  - Lazy load modul XLSX: 0 request XLSX pada loading awal, baru di-load saat tombol unduh Excel ditekan.
  - Race condition search: teks pencarian cepat "AAA" lalu "BBB" menampilkan hasil "BBB" tanpa tertimpa hasil lambat "AAA".

### 4. Build Verifikasi
- `npm run build:all`: Sukses membangun seluruh 10 aplikasi.
- `npm run vercel-build`: Sukses membangun dan membungkus sembilan frontend entrypoints (`Packaged nine frontend entrypoints`).

---

## Deployment ke Produksi

Deployment ke Vercel production proyek **aksis** (`netkom-developers-projects`) telah selesai dan sukses tayang.
- **Vercel Inspect:** `https://vercel.com/netkom-developers-projects/aksis/AMFbdYjKZPzEiwEVyvrMLusi8WZb`
- **Vercel Production Target:** `https://aksis-n9okefunx-netkom-developers-projects.vercel.app`
- **Aliased Domain:** `https://www.aksis.co.id`
- **Status Verifikasi:** `PASS: 9 entrypoints, API health, authentication boundary, and production assets verified at https://www.aksis.co.id` (HTTP/2 200).
