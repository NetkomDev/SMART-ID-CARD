# Audit cakupan Setoran Hari Ini — 29 September 2026

## Kesimpulan

Ringkasan menghitung seluruh kelas di **satu sekolah tempat akun piket bertugas**,
bukan seluruh tenant dan bukan hanya kelas piket. Nama sekolah berasal dari konteks
QR yang diverifikasi server. Tidak ditemukan query ringkasan harian yang menjumlahkan
transaksi lintas tenant dalam kedua jalur implementasi yang diperiksa.

## Alur dan batas kepercayaan

1. `get_portal_context()` mengambil `school_id` dari `qr_access_tokens` berdasarkan
   `auth.uid()`, setelah `portal_session_active()` memeriksa akses QR.
2. `PortalSession.start()` memuat ulang konteks server. Permintaan PWA membawa JWT
   dan `X-School-Id` dari konteks tersebut. Header bukan bukti izin dengan sendirinya.
3. `requireAuth` memverifikasi JWT; `requireTenant` memeriksa keanggotaan aktif dan
   izin pada sekolah yang diminta. Route dashboard mensyaratkan `waste.read`.
4. Route menggunakan `req.tenant.schoolId`; parameter URL `school_id` tidak dapat
   mengganti sekolah tersebut. Respons kini menyertakan `school_id` dari middleware.
5. Jalur RPC `waste_dashboard`: memeriksa sesi, izin sekolah, dan sekolah/peran QR.
   CTE transaksi maupun ringkasan `today` memakai `school_id = p_school_id`.
   Fungsi berjalan sebagai security-definer untuk agregasi lintas kelas, tetapi
   tidak memberikan catatan mentah lintas kelas kepada piket.
6. Jika RPC belum tersedia (`PGRST202`), pembaca kompatibilitas memeriksa sesi dan
   `has_school_permission` memakai kredensial pengguna. Pembaca memeriksa pula
   sekolah, peran, pencabutan, dan kedaluwarsa QR. Selanjutnya service-role hanya
   dipakai di server; semua query transaksi, kelas, siswa, dan keanggotaan kelas
   memfilter `school_id` dari middleware. Query sekolah memfilter ID yang sama.
7. PWA memeriksa ID sekolah respons sebelum merender. Pergantian identitas portal
   memicu pemuatan ulang; respons berbeda sekolah ditolak dan ringkasan dikosongkan.

Super Admin yang berwenang dapat memilih tenant melalui API, tetapi satu respons
tetap berisi tepat satu tenant. PWA piket menggunakan konteks QR sekolahnya sendiri.

## Arti angka dan tanggal

| Elemen | Definisi |
| --- | --- |
| Tanggal | Tanggal `as_of` menurut `schools.timezone`, bukan zona waktu HP |
| Siswa menyetor | Siswa unik dengan transaksi pada hari tersebut; siswa yang menyetor berkali-kali dihitung satu |
| Total setoran | Jumlah `total_kg` semua transaksi sekolah pada hari tersebut |
| Total poin | Jumlah `points_earned` yang tersimpan; tidak dihitung ulang menggunakan tarif saat ini |
| Setoran belum memiliki poin | Transaksi dengan poin NULL atau skema lama tanpa kolom poin |

Hari dimulai pukul 00.00 waktu sekolah hingga waktu pengambilan data. Contoh untuk
Asia/Makassar: 29 September dimulai pada 28 September pukul 16.00 UTC. Transaksi masa
depan dikecualikan. Filter Hari ini/Bulan ini/Semua waktu mengubah klasemen, sedangkan
ringkasan harian tetap memakai hari berjalan.

Ringkasan harian mencakup transaksi sekolah yang tersimpan, termasuk catatan historis
siswa/kelas yang kemudian nonaktif. Grafik kelas dan siswa menggunakan kelas/siswa
aktif. Karena itu jumlah pada grafik tidak selalu sama dengan ringkasan jika status
siswa/kelas berubah; ini sesuai definisi kedua bagian.

## Temuan dan perbaikan

- Label “Seluruh sekolah” ambigu: diganti “Semua kelas di [nama sekolah]”.
- Pembaruan gagal dapat meninggalkan angka lama di kartu Hari Ini: angka dan tanggal
  kini dikosongkan dan pesan kegagalan tetap tampil.
- Identitas tenant pada respons belum diperiksa PWA: API kini mengirim ID sekolah
  dan PWA memeriksanya sebelum menampilkan data.
- Paginasi kompatibilitas berhenti terlalu dini jika batas baris PostgREST lebih
  kecil dari 500: sekarang maju sebesar jumlah baris yang benar-benar diterima
  sampai respons kosong.
- Seluruh transaksi tanpa poin dapat tampak sebagai 0 poin jika tarif sudah diatur:
  kini ditampilkan “—”; label menyebut poin belum tercatat, tanpa mengasumsikan penyebabnya.

## Bukti pengujian

- Typecheck API dan PWA: lulus.
- 19 tes API/agregasi: lulus. Termasuk lebih dari 1.000 transaksi, batas 100 baris
  per respons, tanggal lokal, tenant lain, QR dicabut/kedaluwarsa, dan periode berbeda.
- Browser dengan data simulasi: lulus. Memeriksa label sekolah, ringkasan tetap harian,
  pengosongan data saat gagal, poin NULL, serta penolakan respons sekolah lain.
- `bash tooling/test-waste-db-local.sh`: lulus pada PostgreSQL sementara. Semua
  migrasi diterapkan ke database kosong; pengujian membuat dua tenant, termasuk
  transaksi 100 kg tenant B yang tidak boleh memengaruhi total 7,401 kg tenant A.
  Akses mentah tetap terbatas kelas, agregasi menjangkau kelas lain dalam tenant A,
  akses tenant B/anonim/QR dicabut ditolak. Cluster uji dihapus setelah selesai.

Audit ini membuktikan kode dan perilaku pada fixture lokal, bukan rekonsiliasi isi
database produksi. Tidak ada sesi akun sekolah nyata yang dibuat atau data produksi
yang diubah. Jalur kompatibilitas melakukan beberapa query baca, sehingga pembaruan
data secara bersamaan tidak memiliki jaminan satu snapshot seperti RPC SQL; gunakan
migrasi RPC untuk jalur agregasi utama saat akses pengelolaan Supabase tersedia.
