# Konsolidasi Halaman Kehadiran dan Pengaturan Jam Sekolah (2026-11-01)

## 1. Latar Belakang & Analisis Redundansi
Pada dashboard Admin Sekolah (`apps/admin-web`), sebelumnya terdapat dua menu/halaman terpisah yang sangat identik:
- **Kehadiran (`/attendance`)**: Menampilkan 3 kartu statistik (Kehadiran Hari Ini, Terlambat Hari Ini, Jam Datang & Pulang), tautan *"Pengaturan Jam Pelajaran →"*, dan tabel *"Riwayat Kehadiran (50 Terakhir)"*.
- **Jam Pelajaran (`/school-hours`)**: Menampilkan 3 kartu statistik yang sama persis, formulir *"Pengaturan Jam Pelajaran & Batas Presensi"*, namun menyembunyikan tabel riwayat kehadiran.

Kedua halaman tersebut memanggil endpoint API yang sama:
- `/attendance/summary`
- `/attendance?page=1&page_size=50`
- `/attendance/rules`

Keberadaan dua halaman ini membingungkan administrator sekolah karena informasi inti (jam datang, batas presensi, jam pulang, dan log presensi) terpisah tanpa alasan fungsional yang kuat.

---

## 2. Rincian Perubahan yang Diterapkan
1. **Penggabungan Form ke Halaman Kehadiran (`/attendance`)**:
   - Bagian panel form dipindahkan langsung ke dalam halaman Kehadiran, tepat di bawah 3 kartu statistik dan di atas tabel riwayat kehadiran.
   - Sub judul form diubah dari `"Pengaturan Jam Pelajaran & Batas Presensi"` menjadi `"Pengaturan Jam Sekolah & Batas Presensi"`.
   - Tautan navigasi redundan `<a href="/school-hours">Pengaturan Jam Pelajaran →</a>` dihapus.
   - Logika penyimpanan jam presensi (`PUT /attendance/rules`) tetap berjalan reaktif dan memperbarui portal PWA secara otomatis.

2. **Penghapusan Menu & Rute "Jam Pelajaran" (`/school-hours`)**:
   - Menu `["/school-hours", "Jam Pelajaran", "◷"]` dihapus dari sidebar navigasi `navItems` di `apps/admin-web/src/app.ts`.
   - Ikon rute `/school-hours` dihapus dari `apps/admin-web/src/lib/navigation.ts`.
   - Pengecekan izin rute khusus `/school-hours` di `apps/admin-web/src/lib/permissions.ts` dibersihkan.
   - Router di `apps/admin-web/src/app.ts` menambahkan redirect otomatis dari `/school-hours` ke `/attendance` untuk menjaga kompatibilitas backward bookmark browser admin.

3. **Pembaruan Rangkaian Pengujian**:
   - Skrip pengujian antarmuka `tooling/test-admin-workspace.mjs` diperbarui menyesuaikan daftar menu navigasi (11 menu).

---

## 3. Hasil Verifikasi & Uji Kualitas
- **TypeScript Typecheck (`npm run typecheck:all`)**: PASS untuk seluruh 11 packages & apps.
- **Unit & Integration Tests (`npm test`)**: PASS 50 test files, 256 unit tests.
- **Admin Workspace E2E (`node tooling/test-admin-workspace.mjs`)**: PASS pengujian responsive sidebar, drawer, and lifecycle navigasi 11 rute.
- **Production Build (`npm run vercel-build`)**: PASS build 10 frontend entrypoints dan bundel client tanpa error.
