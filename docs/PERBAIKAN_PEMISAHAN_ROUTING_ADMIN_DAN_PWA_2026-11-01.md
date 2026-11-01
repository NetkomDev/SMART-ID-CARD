# Perbaikan Pemisahan Routing Server & Isolasi Service Worker Admin Web vs Mobile PWA (2026-11-01)

## 1. Masalah yang Diatasi
Administrator sekolah terkadang mengalami fenomena salah tampilan pada dashboard Admin Sekolah (`www.aksis.co.id`), di mana halaman admin (misalnya `/waste`, `/attendance`, `/library`, atau `/extracurricular`) berubah menjadi tampilan mobile PWA (seperti munculnya dialog modal *"Simpan Piket Bank Sampah"*).

### Akar Penyebab:
1. **Direktori Fisik Build Server (`dist/waste`, `dist/library`, dll.)**:
   Build script sebelumnya mengemas PWA langsung ke direktori yang identik dengan nama rute admin (`dist/waste`, `dist/library`, `dist/extracurricular`). Akibatnya, ketika admin me-refresh atau membuka URL seperti `/waste` tanpa garis miring, Vercel mendeteksi keberadaan direktori fisik dan langsung menyajikan `index.html` PWA mobile, bukan SPA shell Admin Web.
2. **Pencemaran Cache Root Service Worker (`sw.js`)**:
   Service worker Admin Web di root domain (`/sw.js`) sebelumnya menangkap seluruh permintaan `GET` di origin dan menyimpannya secara agresif. Saat admin sempat membuka PWA atau portal QR, halaman PWA masuk ke cache shell admin dan salah disajikan pada navigasi dashboard berikutnya.

---

## 2. Solusi yang Diterapkan (Tanpa Mengubah Link PWA HP)
Semua link dan operasional HP yang sudah terpasang tetap berjalan 100% normal tanpa perlu install ulang:
* HP guru piket dan siswa tetap membuka `/attendance/`, `/waste/`, `/library/`, `/extracurricular/`, `/parent/`.

Perbaikan dilakukan pada konfigurasi server & service worker:
1. **Penataan Direktori Packaging Internal (`tooling/package-sites.mjs`)**:
   - PWA dikemas ke subdirektori internal: `pwa-waste/`, `pwa-extracurricular/`, `pwa-library/`, `pwa-led/`, dan `pwa-attendance/`.
   - Menghilangkan direktori fisik yang bentrok langsung dengan rute admin (`dist/waste/`, `dist/library/`, dll.).
2. **Pemisahan Aturan Rewrite di Vercel (`vercel.json`)**:
   - Permintaan dengan trailing slash (`/waste/`, `/library/`, dll.) dan aset PWA (`/waste/assets/...`, `/waste/sw.js`) diteruskan ke direktori internal PWA masing-masing.
   - Permintaan rute Admin Web tanpa trailing slash (`/waste`, `/attendance`, `/library`, dll.) secara bersih jatuh ke rute catch-all `/index.html` (Admin Web).
3. **Upgrade Service Worker Admin Web ke v2 (`apps/admin-web/public/sw.js`)**:
   - Menambahkan daftar pengecualian eksplisit `PWA_PREFIXES` (`/attendance/`, `/waste/`, `/library/`, dll.) agar service worker admin tidak pernah menyadap request PWA.
   - Mode navigasi menggunakan strategi *network-first*.
   - Pada saat aktivasi cache baru `aksis-admin-shell-v2`, cache lama `aksis-admin-shell-v1` yang tercemar otomatis dihapus dari browser admin.

---

## 3. Hasil Pengujian & Verifikasi
- `npm run typecheck:all`: Lulus 100% pada semua 11 apps/packages.
- `npm test`: 50 test files (256 tests) lulus.
- `node tooling/test-admin-workspace.mjs`: Lulus seluruh skenario pengujian navigasi admin responsive.
- `npm run vercel-build`: Berhasil memaketkan 10 frontend entrypoints dengan struktur direktori baru.
