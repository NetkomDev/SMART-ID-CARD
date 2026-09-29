# AKSIS PWA Portals — Redesain & Panduan Pengembangan Sistem (Reference Architecture)

> **Versi:** 0.3.0  
> **Tanggal:** 30 September 2026  
> **Target Aplikasi:** Portal Orang Tua Siswa (`apps/parent-pwa`), Terminal Perpustakaan (`apps/library-terminal`), Ekstrakurikuler (`apps/extracurricular-pwa`), Piket Bank Sampah (`apps/waste-pwa`), dan Admin Web (`apps/admin-web`).

---

## 1. Ringkasan Arsitektur & Kebijakan Keamanan PWA

### A. Kebijakan Akses QR Statis & Permanen (No-Logout Policy)
1. **Penyimpanan Sesi Permanen:**
   Sesi login setiap portal disimpan di `localStorage` browser perangkat pengguna (`aksis.portal.${role}.v1`). Setelah QR Code dipindai/diklik pertama kali, sesi tersimpan secara otomatis dan bertahan selamanya tanpa kedaluwarsa secara mandiri.
2. **Penghapusan Tombol/Link Logout (Keluar):**
   Seluruh tombol "Keluar" atau "Tutup Portal" pada UI PWA (Perpustakaan, Ekstrakurikuler, Orang Tua Siswa, Piket Bank Sampah) telah dihapus dari antarmuka. 
   - *Alasan:* Mencegah pengguna (orang tua, guru, petugas) terkeluar secara tidak sengaja yang dapat mengakibatkan penumpukan pembuatan QR Code baru di Admin Sekolah.
3. **QR Statis Reusable:**
   Tautan/QR Code portal dari Admin Sekolah berlaku secara statis dan dapat dipindai ulang kapan saja tanpa membatalkan atau merusak sesi aktif.
4. **Isolasi Cache Bundler (Vite CacheDir):**
   Setiap sub-aplikasi Vite memiliki direktori `cacheDir` tersendiri di `node_modules/.vite/<app-name>` untuk mencegah bentrokan optimasi dependensi (Vite 504 Outdated Optimize Dep Error) saat dijalankan bersamaan.

---

## 2. Dokumentasi Redesain Portal Orang Tua Siswa (`apps/parent-pwa`)

### A. Spesifikasi Visual & Komponen UI
- **Header Navigation:**
  - Bar bagian atas melengkung berlatar hijau tua (`#154637`) dengan Logo AKSIS, judul **AKSIS**, sub-judul **Kontrol Orang Tua**, Lencana Notifikasi (Bell), dan Tombol Menu.
- **Kartu Profil Siswa (`.student-card`):**
  - Foto avatar lingkaran berukuran 80x80px dengan fallback inisial nama.
  - Nama Lengkap Siswa (`full_name`), Nama Sekolah (`school_name`), Kelas (`class_name`), serta Tanggal Format Indonesia (`Hari, DD Bulan YYYY`).
- **Grid Indikator 2x2:**
  1. **Kehadiran Hari Ini:**
     - Lencana status pill (`✔ Hadir`, `✔ Sudah Pulang`, `⚠ Terlambat`, `○ Belum Hadir`).
     - Detail waktu: `Jam Datang (06.54)` dan `Jam Pulang (15.20)`.
  2. **Poin Sampah:**
     - Gauge Ring / Donut Progress menampilkan total poin (`18 poin`).
     - Detail setoran hari ini (`2,4 kg`).
     - Spanduk edukasi: `📊 Terus jaga lingkungan sekolah tetap bersih!`.
  3. **Kunjungan Perpustakaan:**
     - Indikator kunjungan hari ini (`1 kunjungan hari ini`).
     - Total kunjungan bulan berjalan (`7 kunjungan`).
     - Spanduk edukasi: `📖 Membaca membuka lebih banyak peluang!`.
  4. **Ekstrakurikuler:**
     - Judul kegiatan (contoh: `Bola Basket`).
     - Lencana presensi (`✔ Hadir` / `○ Belum Presensi`).
     - Waktu sesi / presensi (`🕒 15.30 - 17.00`).
     - Spanduk motivasi: `🏆 Terus kembangkan bakat dan minatmu!`.
- **Spanduk Motivasi Bawah (`.motivation-card`):**
  - Ikon bintang lingkaran hijau tua + Teks: `Terus semangat, [Nama Depan Siswa]! Kami selalu mendukung langkah terbaikmu.`
- **Modal Drawer Aktivitas:**
  - Menampilkan riwayat kronologis lengkap (presensi gerbang, setoran sampah, kunjungan perpustakaan, dan presensi ekskul) saat kartu diklik.

---

## 3. Dokumentasi Perubahan Supabase / PostgreSQL RPC

### RPC `get_parent_child_today(target_student_id uuid)`
- **Fungsi:** Mengembalikan data terintegrasi aktivitas siswa hari ini dalam format JSON terstruktur untuk Portal Orang Tua Siswa.
- **Skema Return JSON:**
```json
{
  "student_id": "uuid",
  "timezone": "Asia/Makassar",
  "profile": {
    "full_name": "Andi Muhammad Asyraaf",
    "first_name": "Andi",
    "school_name": "SMA Negeri 3 Watampone",
    "class_name": "Kelas X-2",
    "photo_url": null
  },
  "attendance": {
    "status": "HADIR",
    "check_in": "06.54",
    "check_out": "15.20"
  },
  "waste": {
    "today_kg": 2.4,
    "total_points": 18,
    "today_points": 5
  },
  "library": {
    "today_visits": 1,
    "month_visits": 7
  },
  "extracurricular": {
    "name": "Bola Basket",
    "status": "HADIR",
    "time_attended": "15.30"
  },
  "events": [ /* Array timeline aktivitas */ ]
}
```
- **File Migrasi:** `supabase/migrations/202609290002_redesign_parent_portal.sql` (Telah diterapkan di Supabase Production).

---

## 4. Struktur Direktori PWA Monorepo

```
AKSIS.CO.ID/
├── apps/
│   ├── admin-web/            # Admin Sekolah & Super Admin
│   ├── parent-pwa/           # Portal Orang Tua Siswa (Redesigned)
│   ├── waste-pwa/            # Portal Piket Bank Sampah
│   ├── extracurricular-pwa/  # Portal Ekstrakurikuler
│   ├── library-terminal/     # Terminal Perpustakaan
│   └── shared/               # Shared Theme CSS & Portal Session Handler
├── supabase/
│   └── migrations/           # File Migrasi PostgreSQL
└── vercel.json               # Konfigurasi Build & Rewrites Vercel Production
```

---

## 5. Panduan Deployment Vercel

Build Vercel menggabungkan seluruh aplikasi menjadi 1 output direktori `dist/`:
- `https://aksis-theta.vercel.app/` → Admin Web
- `https://aksis-theta.vercel.app/parent/` → Portal Orang Tua Siswa
- `https://aksis-theta.vercel.app/waste/` → Portal Piket Bank Sampah
- `https://aksis-theta.vercel.app/extracurricular/` → Portal Ekstrakurikuler
- `https://aksis-theta.vercel.app/library/` → Terminal Perpustakaan

---

*Dokumen ini merupakan panduan resmi pengembangan PWA AKSIS.*
