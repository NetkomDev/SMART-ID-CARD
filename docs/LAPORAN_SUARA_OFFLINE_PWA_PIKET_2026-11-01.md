# Laporan suara nama siswa offline — PWA Piket Kehadiran

Tanggal: 1 November 2026. Fitur menyebut nama lengkap siswa yang identitas kartunya dikenali oleh data sekolah pada HP. Penyebutan dilakukan ketika QR kartu atau input identitas dikenali; suara nama tidak berarti transaksi sudah dikonfirmasi server. Pencatatan, alasan keterlambatan/pulang cepat, status antrean, dan sinkronisasi tetap berjalan secara terpisah.

## Implementasi

- Mesin eSpeak NG 1.49.1 beserta data suara Bahasa Indonesia didistribusikan bersama PWA. Sintesis berjalan di Web Worker pada HP dan audio diputar melalui Web Audio; tidak memanggil API suara online dan tidak mengirim nama untuk sintesis.
- Service worker menyimpan file worker dan data suara dalam cache saat persiapan awal. Arsip source berlisensi GPL dan pemberitahuan lisensi disediakan pada `tts/`, tetapi arsip source tidak ikut diunduh untuk penggunaan offline biasa. Worker dan data suara sekitar 3,1 MB sebelum kompresi; persiapan pertama memerlukan koneksi.
- Status menunjukkan saat suara sudah tersimpan untuk penggunaan offline. Tombol **Uji suara** membantu petugas memastikan audio aktif dan volume HP terdengar; tombol suara aktif/nonaktif disimpan pada HP. Android/iOS dapat meminta interaksi sebelum audio diputar, sehingga tombol kamera, input manual, dan tombol uji membuka audio dari interaksi pengguna.
- Nama beruntun disintesis di worker dan dijadwalkan berurutan tanpa menunggu proses suara untuk menyimpan kehadiran. Suara dihentikan ketika halaman disembunyikan atau suara dinonaktifkan. Ketika suara belum siap, PWA tetap dapat mencatat dan mencoba memberi tanda bunyi; status suara menjelaskan bahwa persiapan diperlukan.
- Nama bersumber dari data siswa aktif yang sudah tersimpan dalam snapshot portal. QR yang tidak dikenali pada snapshot tidak menghasilkan nama. Siswa yang baru masuk data sekolah perlu disinkronkan terlebih dahulu ketika HP online.

## Validasi

- Browser Chromium dengan decoder QR asli dan video QR sintetis: memuat ulang PWA dalam mode offline, memindai QR, mengenali nama dari snapshot, menjalankan worker Bahasa Indonesia dari cache dan menghasilkan buffer audio dengan amplitudo nonzero.
- Dua nama diputar sesuai urutan; suara nonaktif tidak mensintesis nama. Pengujian menggunakan data siswa simulasi dan kamera virtual, tanpa transaksi siswa sekolah.
- Regresi pemindaian, antrean offline, deduplikasi, sinkronisasi, input alasan, dan autentikasi tetap diuji. Nama tidak dikirim ke layanan text-to-speech eksternal.
- Pengujian fisik pada HP Android/iPhone, kualitas pengucapan nama setempat, volume, dan kebijakan audio perangkat masih diperlukan. Suara eSpeak bersifat sintetis dan pengucapan nama dapat berbeda menurut ejaan.

## Batas penggunaan

Siapkan PWA, data siswa, dan cache suara saat masih online, tunggu status **Suara siap digunakan offline**, lalu coba tombol **Uji suara**. Jika cache aplikasi atau data situs dihapus, persiapan online perlu diulang. Suara memerlukan PWA aktif, volume HP, dan dukungan Web Worker/Web Audio; ketika HP menyembunyikan halaman, pemutaran dihentikan.

## Lisensi

Komponen suara menggunakan [eSpeak NG](https://github.com/espeak-ng/espeak-ng/tree/1.49.1/emscripten), GNU GPL versi 3 atau yang lebih baru. Pemberitahuan, teks lisensi dan arsip source yang sesuai didistribusikan pada direktori `tts/` PWA.

## Deployment

Identitas deployment dan bukti pengujian disimpan di `docs/analysis/2026-11-01/attendance-voice/`.

Deployment **dpl_D7bhMkGUcAtYtF2SvJCrnckLB3Ww** READY pada 01 November 2026, 02:16:51 WITA; alias `www.aksis.co.id` sudah diverifikasi. Pengujian pada domain produksi lulus untuk aset suara dan source lisensi, cache offline, pemindaian QR dengan kamera virtual, audio nonzero, antrean suara, dan penyimpanan pengaturan suara. API transaksi pada uji browser memakai fixture; tidak ada transaksi siswa sekolah.
