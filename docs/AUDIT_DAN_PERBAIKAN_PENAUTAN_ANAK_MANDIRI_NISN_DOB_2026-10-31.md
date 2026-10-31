# Audit & Perbaikan: Penautan Anak Mandiri via NISN & Tanggal Lahir (Portal Orang Tua & Dashboard Admin Sekolah)

**Tanggal:** 31 Oktober 2026  
**Status:** Selesai, Terverifikasi, dan Siap Produksi  
**Target Komponen:** 
1. Dashboard Admin Sekolah (`apps/admin-web`)
2. PWA Portal Orang Tua (`apps/parent-pwa`)
3. Backend Service API (`apps/api`)
4. Supabase Database Engine (`mzurocuwgoqwooilxuvv`)

---

## 1. Konteks & Analisis Masalah

### 1.1 Masalah Mekanisme Lama (Token Undangan Manual)
Sebelumnya, pada dashboard Admin Sekolah (`/students`), saat admin membuka modal *Akses Portal Orang Tua* untuk siswa, terdapat tombol:
> **"Buat Kode Tautan Tambah Anak (Akun Wali Aktif)"**

Mekanisme ini bekerja dengan cara:
1. Admin sekolah mengklik tombol tersebut untuk menghasilkan token acak 43 karakter di tabel `parent_link_tokens`.
2. Admin sekolah harus menyalin token tersebut dan mengirimkannya secara manual (via WhatsApp/SMS/pesan) kepada orang tua.
3. Orang tua harus membuka menu "Tambah Anak" di Portal PWA Orang Tua, menyalin-tempel token 43 karakter tersebut, lalu menekan tombol hubungkan.

### 1.2 Dampak Negatif Mekanisme Lama
- **Beban Kerja Admin Sekolah:** Admin sekolah dibebani pekerjaan repetitif dan manual untuk membuat dan mendistribusikan kode token satu per satu.
- **Friksi bagi Orang Tua Siswa:** Orang tua yang memiliki lebih dari satu anak (baik di sekolah yang sama maupun di sekolah lain dalam ekosistem AKSIS) harus menunggu respon admin sekolah dan repot menangani string token panjang.
- **Ketidakefisienan Sistem:** Database AKSIS sudah menyimpan data valid seluruh siswa aktif (`students.nisn`, `students.date_of_birth`, `students.school_id`). Mengharuskan pembuatan token acak padahal identitas siswa sudah ada di database merupakan langkah mubazir dan tidak modern.

---

## 2. Solusi Arsitektur Baru: Penautan Mandiri (Self-Service)

### 2.1 Alur Kerja Baru
1. **Wali Aktif:** Orang tua yang sudah memiliki akun aktif dan login di Portal PWA Orang Tua dapat langsung membuka menu **Tambah Anak** (`#nav-add`).
2. **Input Kredensial Siswa:** Orang tua cukup menginput:
   - **NISN Siswa** (misal: `0075849305`)
   - **Tanggal Lahir Anak** (format tanggal `YYYY-MM-DD`)
3. **Pencocokan Otomatis di Database:**
   - Sistem mencocokkan data ke tabel `public.students` di seluruh sekolah aktif dalam ekosistem AKSIS (`s.nisn = clean_nisn OR s.student_number = clean_nisn` AND `s.date_of_birth = p_dob` AND `s.is_active = true`).
   - Jika cocok, sistem secara otomatis menghubungkan siswa ke akun wali di `parent_student_links` dengan status `ACTIVE` dan `verification_source = 'SELF_SERVICE_NISN_DOB'`.
4. **Dukungan Lintas Sekolah (Cross-School):**
   - Jika anak yang ditambahkan berada di sekolah lain yang tergabung dalam AKSIS, sistem otomatis mendaftarkan identitas wali murid ke `parent_portal_identities` untuk sekolah anak tersebut menggunakan nomor kontak wali yang telah tersimpan.
   - Dampak positif: Admin sekolah anak tersebut langsung melihat data wali terdaftar di dashboard mereka tanpa memerlukan tindakan apapun!
5. **Dashboard Admin Sekolah Bebas Beban:**
   - Tombol manual "Buat Kode Tautan Tambah Anak" dan view token dihapus total dari modal akses orang tua di Dashboard Admin Sekolah.
   - Digantikan dengan informasi ringkas dan otomatis bahwa orang tua aktif dapat menautkan anak secara mandiri via PWA Orang Tua cukup menggunakan NISN dan Tanggal Lahir.

### 2.2 Lapisan Keamanan (Security Hardening)
- **Otentikasi Akun:** Hanya akun wali individual terverifikasi (`public.is_individual_parent()`) dengan sesi valid yang diizinkan memanggil fungsi penautan.
- **Brute-Force Rate Limiting:** Menggunakan tabel `public.parent_claim_attempts` dengan batas maksimal 5 kegagalan per jendela waktu 15 menit. Jika terdeteksi tebakan NISN/tanggal lahir berulang, akses langsung dibatasi sementara (HTTP 429).
- **Integritas Status Siswa:** Siswa yang ditautkan harus berstatus aktif (`is_active = true`, `deleted_at IS NULL`) dan sekolah siswa harus berstatus aktif (`status = 'ACTIVE'`, `deleted_at IS NULL`).
- **Audit Logging:** Setiap tindakan penautan tercatat di audit log platform (`public.family_audit`) dengan aksi `parent.child.linked_by_nisn_dob`.

---

## 3. Rincian Modifikasi Teknis

### 3.1 Database Supabase
- **File Migration:** `supabase/migrations/202610310004_parent_self_service_link_by_nisn_dob.sql`
- **Fungsi Baru:** `public.link_child_by_nisn_dob(p_nisn text, p_dob date) RETURNS jsonb`
  - Validasi otentikasi wali.
  - Rate-limit check & failure incrementing.
  - Cross-school student matching via NISN / student_number & DOB.
  - UPSERT `parent_student_links`.
  - Sinkronisasi nomor kontak wali ke `parent_portal_identities`.
  - Audit logging.
- **Pembersihan Objek Usang:**
  - `DROP FUNCTION IF EXISTS public.claim_parent_invitation(text)`
  - `DROP TABLE IF EXISTS public.parent_link_tokens CASCADE`

### 3.2 Backend Service API (`apps/api`)
- **Schema:** `apps/api/src/schemas/parent.ts`
  - Menghapus `claimParentLinkSchema` dan `createParentTokenSchema`.
  - Menambahkan `linkChildByNisnDobSchema` (validasi NISN 4-20 digit angka, tanggal lahir format `YYYY-MM-DD`).
- **Schema Tests:** `apps/api/src/schemas/parent.test.ts`
  - Pengujian kontrak validasi schema NISN dan Tanggal Lahir.
- **Routes:** `apps/api/src/routes/parents.ts`
  - Mengubah handler `POST /parent/link` untuk memanggil RPC `link_child_by_nisn_dob`.
  - Menghapus endpoint `POST /parent/link-tokens`.

### 3.3 Dashboard Admin Sekolah (`apps/admin-web`)
- **File:** `apps/admin-web/src/app.ts` (`openParentAccessModal`)
  - Menghapus tombol `#btn-issue-link-token`, event handler, dan fungsi view `renderLinkTokenView`.
  - Menambahkan card informasi otomatisasi modern di bagian bawah daftar wali:
    > "Sistem Otomatis Tambah Anak Mandiri: Admin tidak perlu repot membuat dan mengirim kode tautan manual. Wali siswa yang sudah memiliki akun di ekosistem AKSIS dapat langsung menghubungkan siswa ini melalui menu Tambah Anak di Portal Orang Tua dengan memasukkan NISN dan tanggal lahir anak."

### 3.4 PWA Portal Orang Tua (`apps/parent-pwa`)
- **File:** `apps/parent-pwa/src/main.ts` (`linkView`)
  - Merombak form "Hubungkan Anak ke Portal":
    - Input NISN Siswa (`inputmode="numeric"`, `pattern="[0-9]{4,20}"`).
    - Input Tanggal Lahir Anak (`type="date"`).
    - Status feedback real-time saat memproses pencocokan data.
    - Notifikasi keberhasilan dan navigasi otomatis langsung ke dashboard anak yang baru ditautkan.

---

## 4. Hasil Verifikasi & Pengujian

| Pengujian | Perintah / Alat | Status | Hasil |
|---|---|---|---|
| Database Migration | Supabase Management API Query | **LULUS** | Function `link_child_by_nisn_dob` aktif, objek token usang dibersihkan. |
| Unit & Integration Tests | `npm test` | **LULUS** | 43 test suite lulus, 213 test cases passed. |
| TypeScript Workspaces | `npm run typecheck:all` | **LULUS** | 10/10 workspaces bebas error TypeScript. |
| Production Build | `npm run vercel-build` | **LULUS** | 9 frontend entrypoint berhasil dikompilasi & dipaketkan. |

---

## 5. Panduan untuk Agen / Pengembang Berikutnya

1. **Alur Tambah Anak Orang Tua:**
   - Endpoint utama adalah `POST /api/v1/parent/link` dengan payload JSON `{ "nisn": string, "date_of_birth": "YYYY-MM-DD" }`.
   - Tidak ada lagi ketergantungan pada token undangan atau kode tautan admin.
2. **Kueri Data Lintas Sekolah:**
   - Relasi siswa tersimpan di `parent_student_links(school_id, parent_user_id, student_id)`.
   - RPC `get_verified_parent_children()` dan `can_access_parent_child(student_id)` secara otomatis menampilkan dan memvalidasi siswa dari berbagai sekolah yang berbeda untuk wali yang sama.
3. **Popup Admin Sekolah:**
   - Di `/students`, admin sekolah cukup menggunakan modal untuk:
     1. Melihat siapa saja wali yang telah terhubung ke siswa tersebut.
     2. Menerbitkan QR Masuk Ulang jika wali terdaftar kehilangan smartphone atau perlu rotasi sesi.
     3. Memberikan NISN dan tanggal lahir siswa jika orang tua lupa data tersebut.
