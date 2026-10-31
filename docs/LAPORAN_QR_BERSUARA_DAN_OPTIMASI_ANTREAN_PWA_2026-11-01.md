# LAPORAN PENERAPAN PEMBACA QR BERSUARA & OPTIMASI ANTREAN PWA
Tanggal: 01 November 2026
Lokasi: `apps/library-terminal`, `apps/extracurricular-pwa`, `apps/waste-pwa`, `apps/shared/natural-voice.ts`

---

## 1. Analisis Metode Pembaca QR Bersuara & Interkoneksi Supabase pada PWA Presensi

### A. Metode Audio / Suara
Pada PWA Presensi (`apps/attendance-pwa`), feedback suara dirancang untuk:
1. **Konfirmasi Instan Tanpa Menatap Layar**: Petugas atau siswa tidak perlu menatap layar HP atau menunggu dialog pop-up ditutup secara manual. Begitu nama siswa dilafalkan, siswa berikutnya dapat langsung maju.
2. **Kualitas Suara Alami (Natural Human Speech)**: Menggunakan sintesis suara on-device berstandar `id-ID` (seperti suara alami Google Bahasa Indonesia atau Apple Damayanti) dengan *watchdog recovery*, *warm-up unlock* pada interaksi pertama pengguna, serta fallback nada melodik Web Audio API jika engine belum siap.
3. **Privasi & Offline**: Pemrosesan suara berlangsung 100% lokal di perangkat (on-device), tanpa mengirim audio atau data pribadi ke server eksternal.

### B. Interkoneksi ke Supabase & Strategi Anti-Antrean
1. **Pemisahan Jalur Offline & Online**: PWA menyimpan data referensi siswa/kegiatan di lokal (`localStorage` / IndexedDB). Ketika memindai, validasi identitas siswa berlangsung seketika (< 50 milidetik).
2. **Non-blocking Background Sync**: Pengiriman transaksi ke API/Supabase tidak menahan antarmuka (UI). UI langsung siap memindai siswa berikutnya tanpa menunggu jaringan edge/cloud selesai merespons.
3. **Kamera Non-Stop (Continuous Scanning)**: Scanner QR kamera dikonfigurasi `once: false` dengan jeda debounce singkat antar-pindaian, sehingga kamera tetap menyala dan siap menangkap barcode siswa berikutnya tanpa henti.

---

## 2. Penerapan pada Tiga PWA Layanan

### A. Arsitektur Shared Engine (`apps/shared/natural-voice.ts`)
Dibuat modul terstandar `NaturalVoice` yang dipakai bersama oleh seluruh PWA:
- Menyediakan selector suara Indonesia manusiawi alami (`id-ID`).
- Persistensi status suara (aktif/senyap) via `localStorage` per modul (`aksis_voice_enabled_${scope}`).
- Tombol "Uji suara" dan switch aktivasi yang seragam di seluruh aplikasi.
- Penanganan auto-unlock audio saat pengguna pertama kali berinteraksi dengan portal.

### B. PWA Ekstrakurikuler (`apps/extracurricular-pwa`)
1. **Tata Letak**: Panel pengaturan "Suara nama siswa" diletakkan tepat di bawah kolom input NISN.
2. **Kamera Continuous**: Parameter scanner diubah menjadi `once: false`, menjaga kamera tetap aktif tanpa perlu menekan tombol buka kamera berulang kali.
3. **Ucap Suara**: Memanggil `speaker.speak(`${student.full_name}, hadir`)` seketika saat presensi kegiatan tercatat atau siswa baru didaftarkan secara cepat.
4. **Optimasi Waktu Antrean**: Waktu auto-dismiss banner sukses diturunkan dari 5000 ms menjadi 1800 ms agar pergantian siswa di barisan berlangsung cepat.

### C. PWA Perpustakaan (`apps/library-terminal`)
1. **Tata Letak**: Panel pengaturan "Suara nama siswa" diletakkan tepat di bawah kolom input NISN manual.
2. **Penghapusan Spinner Pemblokir**: Overlay loading layar penuh (`showLoadingOverlay(true)`) yang sebelumnya membekukan tampilan saat scan kamera dihapus untuk mode kamera, digantikan oleh pemrosesan instan dan notifikasi audio.
3. **Ucap Suara**: Mengucapkan `"Selamat datang, {nama}"` saat kunjungan dicatat atau `"{nama}, kunjungan sudah tercatat"` jika sudah absen hari ini.
4. **Optimasi Waktu Antrean**: Waktu kembali otomatis ke mode siap scan dipersingkat dari 5000 ms menjadi 1800 ms.

### D. PWA Piket Bank Sampah (`apps/waste-pwa`)
1. **Tata Letak**: Panel suara nama siswa diletakkan tepat di bawah form input nomor kartu/NISN.
2. **Ucap Suara Identifikasi**: Saat kartu/QR discan atau NISN ditemukan, nama siswa langsung diucapkan (`speaker.speak(resolvedStudent.full_name)`) untuk memverifikasi pemilik rekening sampah secara verbal.
3. **Ucap Suara Transaksi**: Saat timbangan sampah disimpan, sistem memberikan konfirmasi verbal `"Setoran berhasil disimpan"`.

---

## 3. Hasil Pengujian & Verifikasi

1. **Unit Testing**:
   - `apps/shared/natural-voice.test.ts` berhasil lulus (3 tes pengujian default state, persistensi, dan queueing suara).
   - Seluruh test suite monorepo: **49 file tes, 250 tes lulus (100% pass)**.
2. **Typecheck Monorepo**:
   - `npm run typecheck:all` lulus tanpa kesalahan di seluruh 11 aplikasi monorepo (`api`, `admin-web`, `parent-pwa`, `waste-pwa`, `extracurricular-pwa`, `attendance-pwa`, `library-terminal`, `led-gateway`, `command-center`, `card-writer`, `operations-console`).
3. **Production Build**:
   - `npm run vercel-build` selesai dengan kode keluar 0 dan berhasil memaketkan seluruh bundle produksi.

## 4. Bukti Deployment Produksi

- **Platform Target**: Vercel (`netkom-developers-projects/aksis`)
- **Domain Produksi**: `https://www.aksis.co.id`
- **Deployment URL**: `https://aksis-m3f42ynnf-netkom-developers-projects.vercel.app`
- **Hasil Verifikasi Endpoint**:
  - `https://www.aksis.co.id/library/` -> HTTP 200 OK (elemen `voice-panel` aktif)
  - `https://www.aksis.co.id/extracurricular/` -> HTTP 200 OK (elemen `voice-panel` aktif)
  - `https://www.aksis.co.id/waste/` -> HTTP 200 OK (elemen `voice-panel` aktif)
  - `https://www.aksis.co.id/attendance/` -> HTTP 200 OK (berjalan normal)
