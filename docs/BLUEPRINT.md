AKSIS — PRODUCTION SOFTWARE & SYSTEM ARCHITECTURE
Dokumen: AKSIS-PSA-2026-V1
Status: Production Architecture Baseline
Platform: Multi-school SaaS
Database: Supabase PostgreSQL
Primary API: REST/Edge API
Realtime: Supabase Realtime
Authentication: Supabase Auth
Web: Responsive PWA
Device: ESP32 / PC Gateway / LED Gateway
Architecture: Cloud + Edge/Offline-first
 
1. TARGET ARSITEKTUR
AKSIS tidak dibangun sebagai kumpulan aplikasi terpisah.
AKSIS harus diperlakukan sebagai:
                    ┌───────────────────────────┐
                    │        AKSIS CLOUD        │
                    │                           │
                    │ Supabase PostgreSQL       │
                    │ Authentication            │
                    │ Storage                   │
                    │ Realtime                  │
                    │ API / Edge Functions      │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
              WEB / PWA                     DEVICES
                    │                           │
      ┌─────────────┼─────────────┐      ┌──────┼──────────┐
      │             │             │      │      │          │
    ADMIN        PARENT        TEACHER   GATE   LED    CARD WRITER
      │             │             │      │      │          │
      └─────────────┴─────────────┘      └──────┴──────────┘
Prinsip utamanya:
Satu database pusat, satu identity system, satu model sekolah, satu kontrak API, banyak client.
 

2. TENANCY: MULTI-SCHOOL SAAS
Ini menjadi fondasi paling penting.
Setiap sekolah adalah tenant.
Contoh:
AKSIS
│
├── SCHOOL-001
│   ├── Admin
│   ├── Guru
│   ├── Siswa
│   ├── Gate
│   ├── Perpustakaan
│   └── LED
│
├── SCHOOL-002
│   ├── Admin
│   ├── Guru
│   ├── Siswa
│   └── Device
│
└── SCHOOL-003
Aturan keras
Tidak boleh ada query bisnis yang hanya menggunakan:
student_id
class_id
device_id
tanpa konteks sekolah.
Data bisnis harus mempunyai:
school_id
sebagai tenant boundary.
Contoh:
attendance
----------------
id
school_id
student_id
class_id
device_id
occurred_at
 

3. STRUKTUR HIRARKI DATA
Struktur utama:
Tenant
└── School
    ├── Academic Year
    │   ├── Classes
    │   │   └── Students
    │   └── Activities
    │
    ├── Users
    │   ├── School Admin
    │   ├── Teacher
    │   └── Staff
    │
    ├── Devices
    │   ├── Gate
    │   ├── Library
    │   ├── LED
    │   └── Card Station
    │
    ├── Attendance
    ├── Library
    ├── Waste
    └── Extracurricular
 
4. ACADEMIC YEAR WAJIB MENJADI ENTITAS
Jangan membuat kelas hanya:
X-1
X-2
XI-1
Tetapi:
academic_year
2026/2027
kemudian:
class
X-1
academic_year_id = 2026/2027
school_id = SCHOOL-001
Strukturnya:
academic_years

id
school_id
name
start_date
end_date
is_active
Contoh:
2026/2027
01-07-2026
30-06-2027
ACTIVE
 
5. STUDENT HISTORY
Jangan hanya menyimpan:
students.class_id
karena siswa berpindah kelas.
Gunakan:
student_class_history
struktur:
id
student_id
class_id
academic_year_id
start_date
end_date
is_current
Contoh:
Andi
2026/2027 → X-2
2027/2028 → XI-1
2028/2029 → XII-3
Akibatnya:
Laporan tahun lalu tidak berubah ketika siswa naik kelas.
Ini sangat penting untuk laporan prestasi/kedisiplinan.
 


6. CORE DATABASE
Struktur production minimum:
AUTH / TENANT
├── schools
├── users
├── school_users
├── roles
├── permissions
│
ACADEMIC
├── academic_years
├── classes
├── students
├── student_class_history
│
CARD
├── student_cards
├── card_issuance_jobs
├── card_write_logs
│
DEVICE
├── devices
├── device_credentials
├── device_heartbeats
├── device_events
│
ATTENDANCE
├── attendance_logs
├── attendance_daily_summary
├── late_summary
│
LIBRARY
├── library_visits
│
WASTE
├── waste_transactions
├── waste_class_summary
│
EXTRACURRICULAR
├── extracurriculars
├── extracurricular_sessions
├── extracurricular_members
├── extracurricular_attendance
│
LED
├── led_devices
├── led_contents
├── led_overrides
├── led_events
│
PARENT
├── parent_profiles
├── parent_student_links
├── parent_access_sessions
│
SYSTEM
├── audit_logs
├── notifications
└── system_settings
 
7. STUDENTS
Tetapkan:
students

id UUID PK
school_id UUID NOT NULL
nisn VARCHAR(...)
student_number VARCHAR(...)
full_name VARCHAR(...)
gender
date_of_birth
is_active
created_at
updated_at
Jangan menjadikan:
nama_lengkap
sebagai primary identifier.
Primary identity:
student_id UUID
 
8. KARTU SISWA
Blueprint saat ini menggunakan MIFARE Classic 1K + physical QR Code sebagai satu kartu identitas terpadu. 
Pisahkan identitas kartu dari identitas siswa.
student_cards

id
school_id
student_id
card_uid
card_serial
qr_key
status
issued_at
revoked_at
Status:
ACTIVE
LOST
BLOCKED
REPLACED
EXPIRED
Sehingga ketika kartu hilang:
Card A → BLOCKED
Card B → ACTIVE
Siswa tetap:
student_id = sama
 
9. QR CODE JANGAN BERISI DATA PRIBADI
Jangan:
QR =
NISN + nama + kelas
Gunakan opaque identifier:
https://AKSIS.com/s/8F72X91K
atau token acak.
Server yang menentukan:
8F72X91K
↓
student_id
↓
school_id
↓
student profile
 
10. ROLE & RBAC
Definisikan role resmi:
SUPER_ADMIN
SCHOOL_ADMIN
TEACHER
EXTRA_TEACHER
LIBRARY_STAFF
WASTE_STAFF
PARENT
DEVICE
Tetapi role saja belum cukup.
Gunakan:
role + permission
Contoh:
SCHOOL_ADMIN
├── student.read
├── student.create
├── student.update
├── report.read
├── led.control
└── device.read

WASTE_STAFF
├── student.scan
└── waste.create
 
11. ROW LEVEL SECURITY
Ini wajib.
Contoh prinsip:
school_id pada row
        ↓
school_id pada user's membership
        ↓
ALLOW
Admin sekolah:
school_id = SCHOOL-A
hanya dapat:
SCHOOL-A
Tidak boleh:
SCHOOL-B
SCHOOL-C
Bahkan jika seseorang mengetahui UUID record sekolah lain.
Perangkat berbeda
Device juga harus memiliki:
device_id
school_id
credential
dan hanya boleh mengakses resource yang ditugaskan kepada device tersebut.
 
12. AUTHENTICATION
Gunakan Supabase Auth untuk manusia.
Jangan menyimpan password sendiri dalam tabel custom.
Alur Admin:
AKSIS.com
      ↓
Pilih sekolah
      ↓
Login
      ↓
Supabase Auth
      ↓
school membership
      ↓
Role + Permission
      ↓
Admin Dashboard
 
13. API LAYER
Frontend tidak boleh mempunyai logika bisnis kritis yang tersebar di semua aplikasi.
Gunakan API Layer:
PWA
 ↓
API
 ↓
Business Logic
 ↓
Database
API harus menjadi kontrak resmi antara software.
Contoh:
/api/v1/auth
/api/v1/schools
/api/v1/students
/api/v1/classes
/api/v1/attendance
/api/v1/library
/api/v1/waste
/api/v1/extracurricular
/api/v1/led
/api/v1/devices
/api/v1/cards
/api/v1/parents
/api/v1/reports
 
14. CONTOH API ABSENSI DEVICE
Gate:
POST /api/v1/device/attendance
Request:
{
  "device_id": "GATE-001",
  "event_id": "01J...",
  "card_uid": "04AABBCCDD",
  "occurred_at": "2026-09-12T06:32:15+08:00"
}
Server:
device authentication
↓
device belongs to school?
↓
card valid?
↓
student active?
↓
attendance rule
↓
duplicate check
↓
MASUK/PULANG
↓
insert transaction
↓
response
Response:
{
  "success": true,
  "attendance": "MASUK",
  "student_id": "...",
  "student_name": "Andi",
  "class_name": "X-2",
  "late": false
}
Firmware tidak perlu mengetahui SQL.
 
15. API ERROR STANDARD
Semua aplikasi menggunakan error code yang sama.
Contoh:
AUTH_REQUIRED
FORBIDDEN
SCHOOL_NOT_FOUND
STUDENT_NOT_FOUND
CARD_NOT_FOUND
CARD_BLOCKED
ALREADY_CHECKED_IN
ALREADY_CHECKED_OUT
DEVICE_NOT_REGISTERED
DEVICE_DISABLED
INVALID_QR
DUPLICATE_EVENT
SERVER_UNAVAILABLE
Ini sangat penting agar firmware dan frontend tidak menafsirkan error masing-masing.
 
16. OFFLINE-FIRST GATE
Gate harus tetap bekerja saat internet mati.
Blueprint awal sudah menetapkan buffer offline sampai 2.000 transaksi dan auto-sync. 
Production implementation:
RFID
 ↓
Local Student Cache
 ↓
Decision Engine
 ↓
Local Transaction Queue
 ↓
Cloud Sync
Setiap event wajib memiliki:
event_id UUID
device_id
student_id
occurred_at
local_sequence
sync_status
 
17. OFFLINE QUEUE
State:
PENDING
SYNCING
SYNCED
FAILED
Contoh:
06:31  Andi   PENDING
06:32  Budi   PENDING
06:33  Siti   PENDING
Internet kembali:
PENDING
   ↓
SYNCING
   ↓
SYNCED
 
18. IDEMPOTENCY
Ini wajib.
Misalnya jaringan putus setelah server sebenarnya menerima transaksi.
Gate tidak tahu dan mengirim ulang.
Kalau tidak ada idempotency:
Andi MASUK
Andi MASUK
Andi MASUK
Dengan:
event_id
server cukup mengatakan:
event sudah pernah diproses
sehingga tidak dibuat duplikat.
 
19. WAKTU PADA DEVICE
Gate jangan hanya mengandalkan timestamp server.
Gunakan:
NTP
+
RTC
+
local timestamp
+
server timestamp
Prioritas:
Internet/NTP tersedia
        ↓
Synchronize RTC
        ↓
Network offline
        ↓
RTC digunakan
Transaction:
occurred_at_local
occurred_at_server
Ini membuat audit waktu lebih kuat.
 
20. GATE STATE MACHINE
Gunakan state machine resmi:
IDLE
 ↓
CARD_DETECTED
 ↓
READ_CARD
 ↓
IDENTIFY_STUDENT
 ↓
VALIDATE_ATTENDANCE
 ↓
SAVE_LOCAL
 ↓
SYNC_IF_AVAILABLE
 ↓
SUCCESS
Error:
CARD_UNKNOWN
STUDENT_INACTIVE
DUPLICATE
DEVICE_ERROR
SERVER_ERROR
Respons visual/audio seperti yang sudah ditetapkan blueprint tetap dipertahankan: hijau + salam untuk valid, merah + "Kartu Tidak Dikenali" untuk invalid. 
 
21. DEVICE MANAGEMENT
Tambahkan modul resmi:
devices
Struktur:
id
school_id
device_code
device_type
name
location
firmware_version
hardware_version
status
last_seen_at
created_at
Contoh:
GATE-001
LED-001
LIB-001
CARD-001
 
22. DEVICE HEARTBEAT
Setiap device secara berkala:
POST /api/v1/device/heartbeat
mengirim:
device_id
firmware_version
uptime
signal_strength
storage_status
last_error
timestamp
Server menyimpan:
last_seen_at
Dashboard:
GATE-001   ● ONLINE
LED-001    ● ONLINE
LIB-001    ● OFFLINE
CARD-001   ● ONLINE
 
23. DEVICE OTA
Firmware production harus mempunyai:
firmware_version
update_channel
release_version
checksum
Server dapat menandai:
GATE-001

Current:
1.0.3

Available:
1.0.4

[UPDATE]
Jangan melakukan update firmware tanpa mekanisme rollback/fail-safe.
 
24. AUDIT LOG
Semua tindakan administratif penting direkam.
audit_logs

id
school_id
user_id
device_id
action
entity_type
entity_id
before_data
after_data
ip_address
user_agent
created_at
Contoh:
ADMIN-001
UPDATE_STUDENT_CLASS
student = Andi
before = X-1
after = X-2
Juga:
CARD_WRITTEN
LED_OVERRIDE_CREATED
STUDENT_IMPORTED
STUDENT_DELETED
EXTRACURRICULAR_ENROLLED
 
25. SOFT DELETE
Data historis jangan langsung dihapus.
Gunakan:
is_active
deleted_at
deleted_by
Misalnya siswa keluar sekolah:
is_active = false
Histori tetap ada.
 
26. PORTAL ADMIN SEKOLAH
Struktur:
Dashboard
│
├── Ringkasan
├── Siswa
│   ├── Semua Siswa
│   ├── Import Siswa
│   └── Kelas
│
├── Kehadiran
│
├── Bank Sampah
│
├── Perpustakaan
│
├── Ekstrakurikuler
│
├── LED Board
│   └── Temporary Override
│
├── Laporan
│
├── Kartu Siswa
│
└── Perangkat
 
27. IMPORT DATA SISWA
Admin memilih:
Tahun Ajaran
↓
Kelas
↓
Upload Excel
Server:
VALIDATE FILE
↓
VALIDATE NISN
↓
VALIDATE DUPLICATE
↓
PREVIEW
↓
CONFIRM IMPORT
↓
COMMIT
Jangan langsung memasukkan file tanpa preview.
Contoh:
50 rows
48 valid
1 duplicate
1 missing NISN
Admin harus dapat memperbaikinya.
 
28. PARENT ACCESS — MODEL AMAN
Konsep UX Anda dipertahankan:
Cari sekolah
↓
Cari anak
tetapi pencarian tidak otomatis memberikan akses penuh.
Setelah menemukan siswa:
Nama Anak
Kelas

[Hubungkan Anak]
memerlukan credential/token orang tua.
Setelah terhubung:
parent_student_links
menyimpan:
parent_id
student_id
relationship
status
 
29. PARENT PWA
Setelah login pertama:
AKSIS
 ↓
Dashboard Anak
Tampilan:
ANDI
X-2

HARI INI

06:32
✓ Hadir

09:15
✓ Aktivitas Kebersihan

10:20
✓ Perpustakaan

15:10
✓ Ekstrakurikuler

16:02
✓ Pulang
Tombol:
Tambahkan ke Layar Utama
PWA kemudian mempertahankan sesi dengan aman.
 
30. PRIVACY PARENT
Parent hanya boleh mendapatkan:
student(s) yang linked kepada account tersebut
Tidak:
school-wide student data
Tidak boleh menggunakan URL seperti:
/student/123
sebagai otorisasi.
Authorization harus berasal dari authenticated session + relationship.
 
31. BANK SAMPAH
Struktur workflow:
QR KELAS
↓
AUTH PETUGAS
↓
WASTE DASHBOARD
↓
SCAN QR SISWA
↓
RESOLVE STUDENT
↓
INPUT ORGANIK
INPUT ANORGANIK
↓
VALIDATE
↓
SAVE TRANSACTION
↓
REALTIME UPDATE
↓
LED
 
32. QR PIKET KELAS
Admin mencetak QR:
AKSIS

SMP NEGERI X
KELAS X-2

SCAN UNTUK PIKET BANK SAMPAH
QR mengarah ke:
https://AKSIS.com/waste/k/secure-token
Token mengandung referensi kelas, bukan akses penuh.
 
33. WASTE TRANSACTION
waste_transactions

id
school_id
class_id
student_id
staff_user_id
organic_kg
inorganic_kg
total_kg
created_at
device_source
total_kg harus berasal dari:
organic_kg + inorganic_kg
bukan input manual kedua kali.
 
34. TIMBANGAN DIGITAL
Pisahkan layer:
WEIGHING DEVICE
       ↓
Device Adapter
       ↓
PWA
       ↓
API
       ↓
Database
PWA harus dapat bekerja walaupun timbangan tidak tersedia:
Manual Input
tetapi admin dapat mengetahui bahwa nilai tersebut berasal dari:
SOURCE = MANUAL
atau:
SOURCE = SCALE
Ini berguna untuk audit.
 
35. REALTIME LED
Jangan:
Supabase
↓
langsung Huidu
Gunakan:
Supabase
     ↓
LED Gateway
     ↓
LED Controller
     ↓
LED Matrix
Ini merupakan bagian penting dari perubahan baseline.
 
36. LED GATEWAY
Gateway bertugas sebagai:
Realtime Listener
+
Display State Machine
+
Cache
+
Fallback Engine
+
Controller Adapter
Jadi Huidu hanya menangani pekerjaan display/control sesuai interface yang digunakan.
 
37. LED DISPLAY STATE MACHINE
Prioritas:
EMERGENCY
   ↓
ADMIN_OVERRIDE
   ↓
ACHIEVEMENT
   ↓
NORMAL_DASHBOARD
   ↓
RUNNING_TEXT
Contoh:
Normal
 ↓
Siswa top contributor
 ↓
Achievement animation 5 sec
 ↓
Normal
Blueprint sudah menetapkan interupsi khusus untuk penyetor tertinggi/teraktif selama 5 detik. 
 
38. LED OVERRIDE
Struktur:
led_overrides

id
school_id
title
content_type
content_payload
priority
start_at
end_at
status
created_by
created_at
Contoh:
priority = 100
Override aktif:
NOW >= start_at
AND
NOW < end_at
Setelah itu:
EXPIRED
dan gateway otomatis:
NORMAL
Konsep timer dan auto-revert memang sudah menjadi bagian baseline sebelumnya. 
 
39. COMMAND CENTER
Command Center menjadi read-only dashboard, bukan database processor.
COMMAND CENTER
       ↓
Dashboard API
       ↓
Aggregated data
Grid:
┌───────────────────┬───────────────────┐
│ KEDATANGAN        │ BANK SAMPAH       │
│                   │                   │
│ Top 3 awal        │ klasemen kelas    │
│ Terlambat         │ total kg          │
├───────────────────┼───────────────────┤
│ PERPUSTAKAAN      │ EKSTRAKULIKULER   │
│                   │                   │
│ pengunjung        │ hadir / total     │
│ per kelas         │ ekskul hari ini   │
└───────────────────┴───────────────────┘
Blueprint awal memang menetapkan empat grid tersebut. 
 
40. DASHBOARD API
Daripada browser menghitung data besar:
GET /api/v1/dashboard/today
response:
{
  "attendance": {},
  "late_students": [],
  "waste": {},
  "library": {},
  "extracurricular": {}
}
Server/database yang menghitung agregasi.
 
41. EKSTRAKURIKULER
Struktur:
extracurriculars
       ↓
extracurricular_sessions
       ↓
extracurricular_members
       ↓
extracurricular_attendance
Ini lebih benar dibanding hanya tabel anggota.
Contoh:
FUTSAL
12 Sep 2026
15:00

25 member
21 hadir
2 izin
2 alfa
 
42. FAST ENROLLMENT EKSKUL
Workflow yang sudah ditetapkan blueprint dipertahankan:
SCAN QR
 ↓
CEK MEMBER
 ├── YES → PRESENCE
 └── NO
      ↓
 "Siswa belum terdaftar"
      ↓
 [DAFTAR]
      ↓
ADD MEMBER
      ↓
PRESENCE
Blueprint memang telah mendefinisikan enrollment langsung dan presensi seketika. 
Tetapi tambah:
enrolled_by
enrolled_at
untuk audit.
 
43. CARD WRITER ARCHITECTURE
Ini sebaiknya dibuat sebagai Job Processing System.
Bukan:
operator cari siswa
↓
write
Tetapi:
Admin
↓
Pilih Kelas
↓
Generate Card Jobs
↓
PC Card Writer
↓
Operator hanya memasukkan kartu
 
44. CARD JOB QUEUE
card_issuance_jobs

id
school_id
academic_year_id
student_id
card_id
status
attempt_count
created_at
processed_at
operator_id
Status:
PENDING
PROCESSING
SUCCESS
FAILED
CANCELLED
 
45. CARD WRITER WORKFLOW FINAL
QUEUE READY
     ↓
CARD INSERTED
     ↓
CARD SENSOR
     ↓
READ QR
     ↓
RESOLVE STUDENT
     ↓
CHECK EXPECTED JOB
     ↓
RFID WRITE
     ↓
RFID READ-BACK
     ↓
QR READ-BACK
     ↓
CROSS VALIDATE
     ↓
SUCCESS
     ↓
GREEN + BEEP
Failure:
RED
+
ERROR CODE
 
46. VERIFIKASI KARTU HARUS DUA LAPIS
Setelah write:
RFID data
   ↕
Expected student
dan:
QR identity
   ↕
Expected student
harus semua sama.
Contoh:
Expected:
student_id = ABC

RFID:
student_id = ABC

QR:
student_id = ABC

→ SUCCESS
Jika:
RFID = ABC
QR = XYZ

→ HARD FAIL
Kartu jangan dianggap sukses.
 
47. CARD WRITER HARUS MENYIMPAN LOG
card_write_logs

id
job_id
operator_id
device_id
card_uid
qr_token
student_id
result
error_code
attempt_number
started_at
completed_at
Ini penting untuk produksi massal.
 
48. FLOW OPERASIONAL CARD PRODUCTION
Operator:
1. Login station
2. Download job
3. Ambil blank card
4. Masukkan kartu
5. Scanner membaca QR
6. Sistem mencari job siswa
7. RFID write
8. Verify
9. GREEN + BEEP
10. Kartu dilepas
11. Next card
Operator tidak perlu:
mengetik nama siswa
mencari siswa
menentukan kelas
 
49. LIBRARY
Untuk perpustakaan:
RFID Reader
↓
Local Client
↓
API
↓
library_visits
Data:
id
school_id
student_id
terminal_id
visited_at
Dashboard cukup melakukan agregasi.
 
50. CONFIGURATION JANGAN DITANAM DI FIRMWARE
Contoh jangan:
jam sekolah = 07:00
langsung di firmware.
Lebih baik:
school_settings
atau:
attendance_rules
misalnya:
school_id
entry_start
on_time_until
late_after
checkout_start
Dengan demikian sekolah berbeda dapat mempunyai jam berbeda.
 
51. SCHOOL CALENDAR
Tambahkan:
school_calendar

id
school_id
academic_year_id
date
type
description
Contoh:
SCHOOL_DAY
HOLIDAY
EXAM
CEREMONY
SPECIAL_EVENT
Gate dapat mengetahui:
12 Sep = SCHOOL_DAY
tetapi:
13 Sep = HOLIDAY
 
52. NOTIFICATION EVENT
Tidak perlu langsung membuat modul notifikasi kompleks.
Bangun event:
attendance.created
waste.created
library.visit.created
extracurricular.attendance.created
Lalu nantinya dapat digunakan untuk:
Parent notification
Dashboard
LED
Analytics
Ini membuat sistem mudah dikembangkan.
 
53. EVENT BUS LOGICAL MODEL
Secara logis:
Transaction
      ↓
Domain Event
      ↓
┌─────┼─────────┐
│     │         │
LED  Dashboard Parent
Contoh:
attendance.created
dapat menyebabkan:
Command Center update
Parent timeline update
Late statistics update
tanpa ketiga aplikasi saling berkomunikasi langsung.
 
54. API YANG SEBAIKNYA DIBANGUN PERTAMA
Core:
POST   /auth/login
GET    /schools
GET    /classes
GET    /students
POST   /students/import
Attendance:
POST   /device/attendance
GET    /attendance
GET    /attendance/summary
Waste:
POST   /waste/transactions
GET    /waste/ranking
GET    /waste/summary
Extracurricular:
GET    /extracurriculars
POST   /extracurriculars
POST   /extracurricular/members
POST   /extracurricular/attendance
Library:
POST   /library/visit
GET    /library/summary
LED:
GET    /led/state
POST   /led/override
DELETE /led/override/:id
Parent:
POST   /parent/link
GET    /parent/children
GET    /parent/child/:id/today
Device:
POST   /device/heartbeat
GET    /device/config
GET    /device/firmware
Cards:
POST   /cards/jobs
GET    /cards/jobs
POST   /cards/jobs/:id/result
POST   /cards/write-log
 
55. DIRECT CLIENT ACCESS VS API
Tetapkan aturan:
Boleh langsung
Frontend
→ Supabase Auth
Bisnis kritis
Frontend
→ API
→ Database
Device
Device
→ Device API
→ Database
LED
Realtime/API
→ LED Gateway
→ Controller
Card Writer
PC Application
→ Card hardware
→ API
Ini membuat security boundary jauh lebih jelas.
 
56. SECURITY CREDENTIAL DEVICE
Jangan memasukkan:
SUPABASE_SERVICE_ROLE_KEY
ke firmware atau frontend.
Device harus mempunyai credential sendiri.
Misalnya konsep:
DEVICE ID
DEVICE SECRET / TOKEN
Server dapat mencabutnya:
DEVICE_DISABLED
tanpa mengganti seluruh sistem.
 
57. OBSERVABILITY
Tambahkan:
application logs
device logs
API logs
audit logs
error logs
Kategori:
INFO
WARNING
ERROR
SECURITY
AUDIT
Misalnya:
19:32:10
GATE-001
PN532_READ_ERROR
Admin tidak perlu melihat semuanya, tetapi engineer membutuhkan log tersebut.
 
58. BACKUP & RECOVERY
Database production harus mempunyai:
automated backup
point-in-time recovery
export capability
Admin sekolah boleh melakukan:
Export Attendance
Export Waste
Export Library
Export Extracurricular
tetapi bukan backup database mentah.
 
59. DATA OWNERSHIP
Tetapkan dengan jelas:
AKSIS
=
platform/operator

SEKOLAH
=
pemilik data siswa dan transaksi sekolah
Maka secara teknis:
school_id
harus tetap melekat pada data walaupun user/admin berganti.
 
60. URUTAN DEVELOPMENT FINAL
Saya menyarankan jangan mengikuti urutan aplikasi berdasarkan tampilan.
Bangun berdasarkan dependency:
PHASE 01
DATABASE + TENANCY
↓
PHASE 02
AUTH + RBAC + RLS
↓
PHASE 03
CORE API
↓
PHASE 04
STUDENT + CLASS + ACADEMIC YEAR
↓
PHASE 05
DEVICE MANAGEMENT
↓
PHASE 06
GATE FIRMWARE + OFFLINE ENGINE
↓
PHASE 07
ADMIN WEB
↓
PHASE 08
PARENT PWA
↓
PHASE 09
WASTE PWA
↓
PHASE 10
EXTRACURRICULAR PWA
↓
PHASE 11
LIBRARY
↓
PHASE 12
LED GATEWAY
↓
PHASE 13
COMMAND CENTER
↓
PHASE 14
CARD WRITER
↓
PHASE 15
REPORTING + AUDIT + MONITORING
 
61. DEFINITION OF DONE
Satu modul tidak dianggap selesai hanya karena halaman web sudah tampil.
Contoh Gate Attendance baru dianggap selesai jika:
✓ RFID read
✓ Student validation
✓ Masuk/Pulang logic
✓ Duplicate protection
✓ Offline mode
✓ Local queue
✓ Automatic sync
✓ Idempotency
✓ RTC
✓ Audio
✓ LED
✓ OLED
✓ Device authentication
✓ Heartbeat
✓ Error logging
✓ Audit trail
✓ Firmware version
Demikian pula Waste, Ekskul, LED, Parent, dan Card Writer harus memiliki acceptance criteria masing-masing.
 
62. ARSITEKTUR PRODUK FINAL
Secara keseluruhan, saya menetapkan baseline produksi AKSIS menjadi:
                         ┌────────────────────────┐
                         │     AKSIS CLOUD        │
                         │                        │
                         │ Supabase PostgreSQL    │
                         │ Auth                   │
                         │ Storage                │
                         │ Realtime               │
                         └───────────┬────────────┘
                                     │
                              ┌──────▼──────┐
                              │  API LAYER  │
                              │             │
                              │ Auth        │
                              │ Business    │
                              │ Validation  │
                              │ Device API  │
                              └──────┬──────┘
                                     │
             ┌───────────────────────┼────────────────────────┐
             │                       │                        │
       ┌─────▼──────┐        ┌──────▼───────┐       ┌────────▼────────┐
       │ WEB / PWA  │        │ DEVICE LAYER │       │ REALTIME EVENTS │
       │            │        │              │       │                 │
       │ Admin      │        │ Gate         │       │ Attendance      │
       │ Parent     │        │ Library      │       │ Waste           │
       │ Waste      │        │ Card Writer  │       │ LED             │
       │ Teacher    │        │              │       │ Dashboard       │
       └─────┬──────┘        └──────┬───────┘       └────────┬────────┘
             │                       │                        │
             │                 OFFLINE CACHE                  │
             │                 + LOCAL QUEUE                  │
             │                       │                        │
             │                ┌──────▼──────┐                 │
             │                │ LED GATEWAY │◄────────────────┘
             │                └──────┬──────┘
             │                       │
             │                 HUIDU / LED
             │                       │
             └──────────────┬────────┘
                            │
                     COMMAND CENTER
 
63. EMPAT "KONTRAK" YANG HARUS DIKUNCI SEBELUM CODING
Ini yang paling penting untuk tahap berikutnya.
KONTRAK 1 — Data Contract
Menetapkan:
table
column
datatype
relationship
index
constraint
RLS
KONTRAK 2 — API Contract
Menetapkan:
endpoint
method
request
response
error
authentication
idempotency
KONTRAK 3 — Device Contract
Menetapkan:
device identity
heartbeat
configuration
offline queue
sync
firmware
error codes
KONTRAK 4 — UI/Workflow Contract
Menetapkan:
Admin
Parent
Waste Staff
Extra Teacher
Command Center
Card Operator
beserta setiap state dan action.
 
64. BASELINE YANG SAYA TETAPKAN
Jadi mulai dari titik ini, saya menyarankan baseline engineering AKSIS menjadi:
Multi-school SaaS
→ school_id sebagai tenant boundary.
Role & RLS
→ Supabase Auth + RBAC + PostgreSQL RLS.
API Layer
→ business operation melalui API, bukan menyebar di client.
Offline-first device
→ local cache + event queue + idempotency + RTC.
Device Management
→ device registry + heartbeat + firmware version + OTA readiness.
Audit Log
→ seluruh perubahan penting tercatat.
Academic Year
→ setiap struktur kelas dan laporan terikat periode akademik.
Student History
→ perpindahan kelas tidak merusak histori.
Secure Parent Access
→ relationship/token, bukan sekadar nama sekolah + nama siswa sebagai otorisasi.
LED Gateway
→ Realtime → Gateway → LED Controller → Matrix.
Card Job Queue
→ Admin membuat batch pekerjaan, operator memproses kartu satu per satu dengan verifikasi penuh.
Dengan baseline ini, AKSIS bukan lagi sekadar kumpulan PWA + firmware, tetapi sudah mempunyai fondasi yang layak diperlakukan sebagai platform SaaS sekolah dengan perangkat edge terintegrasi.
Dokumen blueprint awal memang sudah menetapkan integrasi utama dan tahapan deployment hardware/software, tetapi versi di atas merupakan re-arsitektur produksi yang memperjelas boundary, security, lifecycle data, device operation, dan kontrak antarsistem. 
Langkah teknis berikutnya yang paling tepat adalah mengubah baseline ini menjadi Database Specification AKSIS v1: seluruh tabel Supabase lengkap dengan field, PK/FK, index, constraint, enum, RLS policy, trigger, view, dan relasinya. Itu akan menjadi fondasi yang bisa langsung diberikan kepada backend programmer sebelum satu halaman PWA pun dibuat.
<img width="451" height="716" alt="image" src="https://github.com/user-attachments/assets/21071dfc-d601-47eb-aae7-13bff9b8fc1d" />
