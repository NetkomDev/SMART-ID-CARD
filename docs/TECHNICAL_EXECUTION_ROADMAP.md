# AKSIS Technical Execution Roadmap

Dokumen ini menerjemahkan `BLUEPRINT.md` menjadi urutan eksekusi yang dapat dipakai sebagai baseline delivery. Prinsip penguncinya adalah **contract first**: data contract menjadi prasyarat API contract, lalu device dan UI/workflow contract. Setiap fase hanya boleh dipromosikan setelah acceptance criteria, pengujian keamanan tenant, observability, dan runbook operasionalnya tersedia.

## Guardrail lintas fase

- `school_id` adalah batas tenant pada seluruh data bisnis; referensi lintas tabel memakai foreign key komposit untuk mencegah relasi lintas sekolah.
- Supabase Auth adalah identity provider manusia. Password tidak disimpan pada tabel aplikasi.
- Operasi bisnis kritis dan seluruh akses device melewati API; service-role key tidak pernah dikirim ke browser atau firmware.
- Semua endpoint mutasi memakai validasi, authorization, audit trail, dan idempotency bila dapat diulang oleh jaringan/client.
- Migrasi bersifat forward-only, ditinjau melalui staging, dan disertai backup/rollback plan.
- Definition of Done (DoD) setiap fase mencakup test otomatis, tenant-isolation test, logging/metrics, dokumentasi, dan threat review sesuai permukaan yang berubah.

## Roadmap 15 fase

### Phase 01 — Database + Tenancy

**Tujuan:** mengunci Data Contract v1 dan fondasi multi-school.

1. Terapkan enum, fungsi utilitas, tabel `schools`, data akademik, siswa, kartu, dan perangkat.
2. Gunakan UUID, timestamp berzona waktu, soft-delete/lifecycle field, constraint domain, FK tenant-komposit, dan indeks akses utama.
3. Tambahkan trigger `updated_at`, aturan satu tahun ajaran aktif, satu riwayat kelas aktif, serta satu kartu aktif per siswa.
4. Siapkan Supabase project untuk development/staging/production, migrasi CI, backup, PITR production, dan seed terpisah untuk data non-production.

**Deliverable awal:** `supabase/migrations/202609210001_phase_01_02_core_tenancy_rbac.sql`.

**Exit criteria:** migrasi dapat diterapkan pada database kosong dan diulang setelah reset; FK menolak relasi lintas sekolah; constraint lifecycle dan indeks tervalidasi; restore drill terdokumentasi.

### Phase 02 — Auth + RBAC + RLS

**Tujuan:** mengunci identity, membership, role, permission, dan isolasi tenant di database.

1. Hubungkan `public.users.id` satu-ke-satu dengan `auth.users.id`; provisioning profile dilakukan server/trusted trigger, bukan penyimpanan password custom.
2. Kelola membership melalui `school_users`, role melalui `roles`, permission melalui `permissions`, serta junction `school_user_roles` dan `role_permissions`.
3. Aktifkan dan paksa RLS pada seluruh tabel; policy membaca `auth.uid()` melalui helper ber-`search_path` tetap. Provisioning tenant pertama hanya melalui backend service role.
4. Seed role/permission tenant secara transaksional dan buat test matrix: anonymous, member aktif, member nonaktif, admin sekolah A/B, dan upaya FK lintas tenant.

**Exit criteria:** tidak ada akses anonymous ke data aplikasi; user hanya melihat profil sendiri dan tenant aktifnya; query UUID tenant lain menghasilkan nol row/forbidden; service role hanya berada di backend secret store.

### Phase 03 — Core API

**Tujuan:** mengunci API Contract v1 dan lapisan business logic.

- Bangun REST `/api/v1` dengan OpenAPI, versioning, schema validation, correlation ID, pagination, rate limit, serta error envelope/code baku.
- Implementasikan auth context (user, school, roles, permissions), repository tenant-aware, audit hook, dan idempotency store.
- Prioritaskan `/auth`, `/schools`, `/classes`, `/students`, health/readiness; hasilkan SDK TypeScript dari OpenAPI.

**Exit criteria:** contract/integration test lulus, seluruh query membawa tenant context, error code konsisten, dan SLO awal serta API logs tersedia.

### Phase 04 — Student + Class + Academic Year

**Tujuan:** menyediakan master akademik dan histori yang stabil lintas tahun.

- CRUD tahun ajaran, kelas, siswa, perpindahan kelas transaksional, dan import Excel validate → preview → confirm.
- Cegah periode kelas tumpang tindih, perubahan laporan historis, duplikasi NISN/nomor siswa, dan import ganda.
- Emit domain event untuk perubahan siswa/kelas dan catat audit before/after.

**Exit criteria:** import parsial tidak pernah tersimpan sebelum konfirmasi; promosi kelas mempertahankan histori; laporan tahun lalu tidak berubah.

### Phase 05 — Device Management

**Tujuan:** mengunci Device Contract dan lifecycle perangkat.

- Registry device, credential yang di-hash dan dapat dicabut/dirotasi, scoped access, configuration, heartbeat, health, firmware channel, checksum, dan OTA metadata.
- Tambahkan `device_credentials`, `device_heartbeats`, `device_events`; jangan berikan Supabase service key kepada device.
- Dashboard online/offline berdasarkan heartbeat dan alert untuk error/security events.

**Exit criteria:** device lintas sekolah ditolak; revoke berlaku segera; heartbeat dan config kompatibel mundur; prosedur OTA rollback diuji.

### Phase 06 — Gate Firmware + Offline Engine

**Tujuan:** gate tetap aman dan deterministik ketika cloud tidak tersedia.

- Implementasikan state machine resmi, cache siswa/kartu bertanda versi, RTC+NTP, queue minimal 2.000 event, dan status `PENDING/SYNCING/SYNCED/FAILED`.
- Setiap event memiliki UUID, local sequence, local/server timestamp; sinkronisasi memakai idempotency dan retry exponential backoff.
- Lengkapi RFID, OLED, LED, audio, watchdog, structured device log, dan secure credential storage.

**Exit criteria:** soak test offline/online, power-loss recovery, queue penuh, clock drift, duplicate delivery, unknown/blocked card, dan degraded cloud seluruhnya lulus.

### Phase 07 — Admin Web

**Tujuan:** menyediakan PWA administrasi sekolah berbasis permission.

- Dashboard, siswa/import/kelas, kehadiran, kartu, perangkat, serta entry point modul lain; route guard hanya UX, API/RLS tetap enforcement.
- Responsive, accessible, installable PWA dengan loading/empty/error state dan optimistic update hanya untuk operasi aman.

**Exit criteria:** E2E per role, accessibility audit, bundle/performance budget, serta tidak ada service key atau data tenant lain di bundle/cache.

### Phase 08 — Parent PWA

**Tujuan:** akses orang tua hanya pada anak yang terhubung.

- Bangun profile, secure link/verification flow, `parent_student_links`, session revocation, children list, dan timeline hari ini.
- Authorization berasal dari session + relasi aktif, bukan ID pada URL atau hasil pencarian siswa.

**Exit criteria:** enumeration test dan horizontal privilege escalation gagal; unlink/revoke segera menutup akses; cache PWA tidak membocorkan data setelah logout.

### Phase 09 — Waste PWA

**Tujuan:** transaksi bank sampah auditable dan realtime.

- Secure class token, staff auth, scan siswa, input organik/anorganik, generated total, sumber `MANUAL/SCALE`, adapter timbangan, ranking, dan summary.
- Emit `waste.created`; update realtime/LED hanya setelah transaksi committed.

**Exit criteria:** precision/unit test, token expiry, duplicate submission, unavailable scale fallback, dan ranking reconciliation lulus.

### Phase 10 — Extracurricular PWA

**Tujuan:** kelola ekskul, sesi, anggota, fast enrollment, dan presensi.

- Implementasikan `extracurriculars`, sessions, members, attendance, `enrolled_by/enrolled_at`, izin/alfa, dan event domain.
- Fast enrollment wajib konfirmasi eksplisit dan idempotent.

**Exit criteria:** presensi duplikat ditolak, membership lintas sekolah/sesi ditolak, serta aggregate hadir/total tervalidasi.

### Phase 11 — Library

**Tujuan:** pencatatan kunjungan perpustakaan melalui terminal yang terautentikasi.

- Local client/reader → Device API → `library_visits`; dukung idempotency, offline retry, summary per kelas, dan event `library.visit.created`.

**Exit criteria:** retry tidak menggandakan kunjungan, terminal hanya mengirim untuk tenant sendiri, dan summary cocok dengan transaksi sumber.

### Phase 12 — LED Gateway

**Tujuan:** memisahkan realtime cloud dari controller fisik.

- Gateway menyediakan listener, cache, fallback, adapter Huidu, dan state machine prioritas `EMERGENCY > ADMIN_OVERRIDE > ACHIEVEMENT > NORMAL_DASHBOARD > RUNNING_TEXT`.
- Override memakai window waktu, auto-expire/auto-revert, acknowledgement, dan heartbeat.

**Exit criteria:** disconnect/reconnect, event replay, override collision/expiry, fallback content, dan controller failure diuji di hardware-in-the-loop.

### Phase 13 — Command Center

**Tujuan:** dashboard read-only yang murah dan konsisten.

- Sediakan `/dashboard/today` dari view/materialized aggregate/cache server untuk attendance, late, waste, library, dan extracurricular.
- Realtime hanya menginvalisasi/refetch data agregat; browser tidak menghitung tabel transaksi besar.

**Exit criteria:** rekonsiliasi agregat, load test jam masuk sekolah, freshness SLO, dan mode stale/degraded tampil jelas.

### Phase 14 — Card Writer

**Tujuan:** produksi kartu berbasis job dengan verifikasi dua lapis.

- Implementasikan job queue, lease/attempt/retry, station auth, RFID write/read-back, QR resolve/read-back, hard fail saat mismatch, dan immutable write log.
- Operator tidak memilih identitas manual; seluruh hasil memakai code error baku dan audit.

**Exit criteria:** concurrency dua station, kartu salah, QR/RFID mismatch, crash recovery, retry limit, dan throughput batch diuji pada hardware aktual.

### Phase 15 — Reporting + Audit + Monitoring

**Tujuan:** menutup kesiapan produksi dan operasi platform.

- Reporting/export tenant-scoped untuk attendance, waste, library, extracurricular; audit append-only; retention dan privacy policy.
- Centralized application/API/device/security logs, metrics, tracing, alerting, runbook, SLO/error budget, backup restore, dan incident response.
- Lakukan security review, penetration test, disaster-recovery drill, data ownership/export review, dan production readiness review.

**Exit criteria:** laporan rekonsiliasi dengan transaksi; privileged action dapat ditelusuri; alert actionable; RPO/RTO dan restore drill tercapai; sign-off operasional selesai.

## Dependency dan release strategy

- Fase 01–02 adalah security foundation dan tidak boleh dipotong. Fase 03–05 menghasilkan kontrak yang dipakai seluruh client.
- Setelah kontrak stabil, tim dapat mengerjakan client secara paralel, tetapi urutan release tetap mengikuti dependency: Gate memerlukan Core API+Device, Parent memerlukan secure links, LED/Command Center memerlukan domain events.
- Gunakan feature flag per sekolah, canary tenant, expand/migrate/contract untuk perubahan schema, dan backward compatibility minimal satu versi client/device selama rollout.

## Struktur direktori yang direkomendasikan

```text
aksis/
├── apps/
│   ├── api/                    # REST/Edge API composition root
│   ├── admin-web/              # Admin responsive PWA
│   ├── parent-pwa/
│   ├── waste-pwa/
│   ├── extracurricular-pwa/
│   ├── command-center/
│   ├── card-writer/            # Desktop/local hardware client
│   └── led-gateway/            # Edge gateway service
├── services/
│   ├── identity-access/        # memberships, RBAC, authorization
│   ├── academics/              # academic year, class, student history
│   ├── attendance/
│   ├── cards/
│   ├── devices/
│   ├── library/
│   ├── waste/
│   ├── extracurricular/
│   ├── led/
│   ├── parents/
│   └── reporting/
├── packages/
│   ├── api-contract/           # OpenAPI, generated clients, error codes
│   ├── domain-events/          # event names and versioned payload schemas
│   ├── authz/                  # shared permission vocabulary, not enforcement-only
│   ├── db/                     # generated DB types/repositories
│   ├── ui/                     # design system
│   ├── validation/             # shared input schemas
│   ├── observability/
│   └── config/
├── firmware/
│   ├── gate/
│   ├── library-terminal/
│   └── shared/                 # protocol, queue, clock, OTA primitives
├── supabase/
│   ├── migrations/
│   ├── seed.sql                # non-secret local bootstrap only
│   ├── functions/              # thin Edge Function adapters
│   └── tests/                  # pgTAP: constraints, RLS, tenant isolation
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── hardware-in-loop/
├── infra/
│   ├── environments/
│   ├── monitoring/
│   └── runbooks/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── api/
│   ├── device-contract/
│   └── workflows/
└── tooling/                    # CI scripts, generators, lint configuration
```

Backend dibagi berdasarkan bounded context, bukan berdasarkan controller/model global. Frontend dipisah per persona/deployment tetapi berbagi kontrak, validasi, observability, dan design system melalui `packages`; package bersama tidak boleh berisi business rule yang menghindari API. Dependensi domain mengarah ke dalam, sementara adapter HTTP, Supabase, realtime, dan hardware berada di tepi.
