# Laporan Perbaikan: QR Code Portal Permanen & Tombol Aksi di Dashboard Admin Sekolah

Tanggal: 31 Oktober 2026  
Status: Selesai & Teruji  

## 1. Ringkasan Kebutuhan
Pada Dashboard Admin Sekolah (`/pwa-portals` atau `/portal-qr`):
1. **QR Code Portal Permanen**: Setiap QR portal yang telah dibuat oleh admin harus tampil secara permanen di halaman ini (tidak lagi kembali ke placeholder kosong "Klik tombol di bawah untuk membuat QR akses baru" saat halaman dimuat ulang atau direfresh).
2. **3 Tombol Aksi Langsung**:
   - **"Cetak"**: Langsung membuka dialog cetak kartu placard QR portal yang rapi, lengkap dengan nama sekolah, judul portal, dan instruksi akses smartphone.
   - **"Ganti"**: Mengganti QR yang telah dibuat dan dicetak sebelumnya dengan QR baru (dengan konfirmasi modal, menonaktifkan/mengganti token lama di database, serta langsung merender QR baru).
   - **"Buka"**: Membuka link portal langsung di tab baru browser atau di aplikasi PWA jika sebelumnya telah diinstal pada perangkat tersebut.
3. **Sinkronisasi Backend & Supabase**:
   - Kolom `token` disimpan di tabel `public.qr_access_tokens`.
   - RPC `provision_portal_access` mendukung penyimpanan token.
   - Endpoint `POST /auth/qr/generate` secara otomatis memutakhirkan dan mencabut token aktif sebelumnya pada cakupan portal yang sama agar hanya ada satu QR kanonik yang aktif.
   - Endpoint `GET /auth/qr` mengembalikan data token aktif untuk admin sekolah yang berhak sehingga kartu dapat langsung merender QR secara instan.

## 2. Perubahan Implementasi

### A. Database & Supabase Migration
- **Berkas**: `supabase/migrations/202610310007_permanent_portal_qr_tokens.sql`
- Menambahkan kolom `token text` pada tabel `public.qr_access_tokens`.
- Memperbarui fungsi `provision_portal_access` untuk menerima parameter `p_token text default null` dan menyimpannya ke `qr_access_tokens.token`.
- Menyediakan wrapper kompatibilitas 7-argumen untuk pemanggil lama.
- Diterapkan ke live project Supabase. Seluruh token aktif lama telah dimutakhirkan dengan token baru yang valid.

### B. Backend API (`apps/api/src/routes/portal-auth.ts`)
- **`POST /auth/qr/generate`**:
  - Mengirimkan `p_token: token` ke `provision_portal_access`.
  - Secara otomatis menonaktifkan (`revoked_at = now()`) token aktif sebelumnya untuk sekolah dan portal/lingkup kelas yang sama.
- **`GET /auth/qr`**:
  - Menyertakan kolom `token` pada pemanggilan `.select(...)` sehingga frontend admin web menerima token untuk merender QR code.

### C. Frontend Admin Web (`apps/admin-web/src/app.ts`)
- Memperbarui `pwaPortalsPage()`:
  - Mengambil daftar token aktif saat inisialisasi.
  - Untuk setiap portal kartu (`attendance`, `library`, `extracurricular`, `parent`):
    - Jika terdapat token aktif dan kolom `token` tersedia, QR code langsung dirender permanen menggunakan `QRCode.toDataURL(url)` tanpa harus menekan tombol buat ulang.
    - Tombol "Buat QR akses" disembunyikan, dan container `.portal-actions` menampilkan 3 tombol aksi:
      1. `🖨️ Cetak`: Menambahkan kelas `.print-active` ke kartu dan memicu `window.print()`.
      2. `🔄 Ganti`: Menampilkan popup modal konfirmasi, memanggil `POST /auth/qr/generate`, dan langsung memperbarui tampilan kartu serta daftar akses di tabel bawah.
      3. `↗ Buka`: Membuka URL portal (`${origin}/${portal}/#token=...`) dengan `target="_blank" rel="noopener noreferrer"`.
  - Untuk portal **Piket Bank Sampah** (`waste`):
    - Responsif terhadap pilihan dropdown `Lingkup Kelas`.
    - Jika kelas yang dipilih sudah memiliki QR aktif, QR langsung tampil permanen bersama ketiga tombol aksi ("Cetak", "Ganti", "Buka").
    - Jika kelas belum memiliki QR, menampilkan placeholder dan tombol "Buat QR akses" untuk kelas tersebut.

## 3. Hasil Pengujian
1. **Typecheck All**:
   - `npm run typecheck:all` -> Lulus pada seluruh 11 packages (api, admin-web, parent-pwa, waste-pwa, extracurricular-pwa, attendance-pwa, library-terminal, led-gateway, command-center, card-writer, operations-console).
2. **Automated Unit & Integration Tests**:
   - `npm test` -> 48 test files, 246 tests passing (100% lulus).
3. **Production Build**:
   - `npm run vercel-build` -> Berhasil mengemas seluruh aplikasi frontend dan backend ke `dist/`.
