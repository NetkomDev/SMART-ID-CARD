# Laporan Perbaikan PWA Piket Kehadiran & PWA Orang Tua

**Tanggal:** 1 November 2026  
**Aplikasi:** PWA Piket Kehadiran (`apps/attendance-pwa`), PWA Orang Tua (`apps/parent-pwa`)

---

## 1. Ringkasan Perubahan

Berdasarkan permintaan pemilik sistem, dilakukan perbaikan menyeluruh pada alur penggunaan, tata letak UI, performa buka aplikasi, dan validasi jam kehadiran:

### A. Penyempurnaan Tata Letak & UI PWA Presensi
1. **Pemberesan Teks & Tombol Obsolet**:
   - Menghapus teks bantuan: *"Antar-HP offline, duplikat diperiksa saat sinkron. Waktu pindai paling awal digunakan."*
   - Menghapus tombol *"Perbarui data siswa"*. Pembaruan data siswa dan aturan jam sekolah kini dipaksa berjalan secara otomatis di latar belakang saat online.
2. **Restrukturisasi Header Kartu Sekolah & Petugas**:
   - Nama Sekolah ditempatkan di bagian atas.
   - Nama Guru / Petugas Presensi ditempatkan di bawah nama sekolah berupa *chip button* (`#scanner-name-display`) dengan ikon dan indikator edit (`✎`).
   - Tombol teks *"Ubah"* dihilangkan, dan fungsinya langsung terpicu ketika nama guru/petugas diketuk atau ditekan.
   - Indikator status *Online/Offline* dan antrean dipindahkan ke sudut kanan atas, rata kanan secara rapi.
3. **Penyimpanan Lokal & Pemuatan Instan (Instant Scan Ready)**:
   - Data siswa dan aturan sekolah yang telah tersimpan di IndexedDB (`snapshots`) langsung dimuat seketika saat aplikasi dibuka tanpa menunggu panggilan jaringan (`refreshState()`).
   - Kamera dan tombol presensi langsung aktif siap memindai QR kartu siswa dalam hitungan milidetik.
   - PWA secara otomatis menyinkronkan data terbaru di latar belakang jika perangkat terhubung ke internet.

### B. Audit & Sistem Deteksi Jam Otomatis Presensi
1. **Deteksi Otomatis Datang vs Pulang**:
   - Sistem membaca aturan jam sekolah (`check_in_end` dan `check_out_start`).
   - Titik tengah (midday boundary) dihitung secara dinamis. Sebelum waktu tengah hari (pagi), mode secara otomatis memilih **"Datang / Masuk"**. Melewati waktu tersebut atau saat jam kepulangan tiba, mode otomatis beralih ke **"Pulang"**.
   - Mode otomatis dievaluasi saat aplikasi dibuka, secara periodik tiap 30 detik, serta tepat saat pemindaian QR berlangsung.
   - Guru piket tetap dapat mengubah mode secara manual kapan saja dengan mengetuk tombol *"Datang / Masuk"* atau *"Pulang"*.

### C. Validasi Jam Kehadiran & Hari Libur
1. **Popup Terlambat & Alasan**:
   - Jika QR dipindai melewati batas jam masuk (`check_in_end`), sistem otomatis menandai siswa sebagai terlambat dan memunculkan modal keterangan dengan opsi *quick chips* alasan keterlambatan (misal: "Macet di jalan", "Ban bocor / kendaraan rusak", "Hujan lebat / cuaca buruk", dll.) agar petugas dapat mencatat dengan cepat.
2. **Popup Bukan Waktu Sekolah (Hari Libur & Pra-Jam Kedatangan)**:
   - Jika QR dipindai sebelum batas awal kedatangan (`check_in_start`), atau jika dipindai pada hari Minggu:
     - Muncul popup modal **"Bukan Waktu Sekolah"** dengan tombol **"Tutup"**.
     - Sistem **TIDAK** menyimpan ataupun mengirimkan data pemindaian tersebut ke database (pemindaian dibatalkan).

### D. Tampilan Jam Pulang pada PWA Orang Tua
1. **Penanganan Siswa Tidak Absen Pulang**:
   - Jika siswa telah tercatat datang di sekolah (`check_in` ada), namun tidak melakukan pemindaian saat jam pulang (`check_out` kosong / `—`), tampilan *Jam Pulang* pada kartu kehadiran PWA Orang Tua menampilkan teks: **"Tidak absen pulang"** dengan aksen penanda yang rapi.

---

## 2. Bukti Pengujian & Verifikasi

1. **Pengujian Browser Headless (`tooling/test-attendance-install-prompt.mjs`)**:
   - PWA Piket Kehadiran dibuka dan diverifikasi layout barunya.
   - Tombol *"Simpan & Install"* terverifikasi.
   - Badge nama guru terverifikasi.
   - Mengetuk chip nama guru terbukti membuka kembali modal edit nama.
   - Hasil: **ALL ATTENDANCE INSTALL PROMPT TESTS PASSED**.
2. **Pemeriksaan Typecheck (`npm run typecheck:all`)**:
   - Lulus 100% untuk semua paket dan aplikasi.
3. **Pemeriksaan Unit Tests (`npm test`)**:
   - 48 test files lulus, 246 tests lulus (100%).
4. **Pemeriksaan Build (`npm run vercel-build`)**:
   - 10 entrypoints frontend dan API berhasil dibuild tanpa error.
