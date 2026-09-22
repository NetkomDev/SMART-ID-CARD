# Audit Implementasi terhadap Technical Execution Roadmap

**Tanggal audit:** 22 September 2026  
**Baseline:** commit `4613b85` (`Introduce AKSIS Core API, Supabase migrations, multiple PWAs, and tooling`)<br>
**Ruang lingkup:** seluruh source, migrasi, API, kontrak, UI, test, dan dokumen operasional yang dilacak Git; verifikasi dilakukan secara statis serta melalui typecheck, unit/contract test, build produksi, dan parse YAML lokal.

## Ringkasan eksekutif

Roadmap mendefinisikan 15 fase dengan Definition of Done (DoD) lintas fase yang mencakup test otomatis, tenant-isolation test, observability, dokumentasi, dan threat review. Audit tidak memberi status **Done** hanya berdasarkan keberadaan source code; seluruh exit criteria fase juga harus mempunyai bukti yang dapat dijalankan atau artefak operasional.

| Status | Jumlah | Fase |
| --- | ---: | --- |
| Done | 0 | — |
| Partial / In progress | 15 | 01–15 |
| Not started | 0 | — |

Fondasi produk mencakup **11 migrasi SQL, 37 tabel aplikasi, 62 policy RLS, 55 path OpenAPI, sembilan frontend/edge app, serta 77 unit/contract test dalam 14 test file**. Seluruh tabel yang ditemukan secara statis mempunyai `ENABLE ROW LEVEL SECURITY`. Walaupun permukaan awal Phase 01–15 sudah ada, tidak satu pun fase dinyatakan **Done** karena exit criteria roadmap mensyaratkan bukti PostgreSQL/RLS, E2E, hardware-in-the-loop, observability deployment, security review, serta drill operasional yang belum tersedia.

## Metode dan inventaris

Audit dilakukan dengan:

1. Membaca seluruh tujuan, deliverable, dependency, dan exit criteria Phase 01–15 di `TECHNICAL_EXECUTION_ROADMAP.md`.
2. Menginventarisasi migrasi, route, middleware, schema Zod, test, PWA, dan path OpenAPI.
3. Menelusuri kata kunci dan artefak yang diwajibkan roadmap (import, audit, revoke/rotate, firmware, extracurricular, library, LED, command center, card writer, reporting, monitoring, dan runbook).
4. Menjalankan `npm run typecheck` dan `npm test` dari root repositori.

Artefak utama yang ditemukan:

- Database: 11 forward migrations, 37 tabel, 62 policy, fungsi security-definer, composite FK tenant, dan satu SQL integration suite Phase 11.
- API: 21 route/middleware/lib context untuk human, parent, operator, dan device runtime; seluruh business route berada di bawah `/api/v1`.
- Frontend/edge: `admin-web`, `parent-pwa`, `waste-pwa`, `extracurricular-pwa`, `library-terminal`, `led-gateway`, `command-center`, `card-writer`, dan `operations-console`.
- Contract: OpenAPI 3.1.0 versi 1.12.0 berhasil diparse sebagai YAML dan berisi 55 path Phase 03–15.
- Test: 14 test file/77 test lulus, tetapi sebagian besar merupakan schema/unit/auth-boundary test; SQL Phase 11 tersedia namun belum dapat dieksekusi tanpa database disposable.

## Temuan lintas arsitektur

### Kekuatan

1. **Tenant boundary berlapis.** API menggunakan user-scoped Supabase client, middleware membership/permission, filter `school_id`, RLS, dan composite FK; service-role key tidak diterima oleh aplikasi browser.
2. **Device boundary eksplisit.** Gate, library, LED, dan card station memakai `Authorization: Device`, token hash, device type/status, expiry/revocation, serta RPC security-definer dengan `search_path` tetap.
3. **Contract-first cukup konsisten.** Zod, error envelope, correlation ID, OpenAPI, dan route composition tersedia untuk seluruh domain.
4. **Offline/idempotency primitives tersedia.** Gate dan library memakai event UUID/local sequence; extracurricular, waste, dan job tertentu mempunyai uniqueness/idempotency constraint.
5. **Operability baseline tersedia.** JSON logging, redaction, process metrics, audit append-only, SLO/error budget, incident/restore/privacy runbook sudah terdokumentasi.

### Risiko dan gap prioritas

| Prioritas | Temuan | Dampak | Tindakan wajib |
| --- | --- | --- | --- |
| P0 | 11 migrasi belum terbukti dapat diterapkan berurutan pada Supabase kosong; SQL Phase 11 belum dijalankan | Syntax/signature/RLS defect baru diketahui saat deployment | Tambah Supabase local CI, `db reset`, dan jalankan matrix dua tenant untuk semua domain |
| P0 | Belum ada seed permission/role standar untuk permission baru (`library.*`, `led.*`, `dashboard.read`, `card.write`, `audit.read`, dll.) | API dapat selalu 403 pada tenant baru | Seed katalog permission dan role assignment secara idempotent/transaksional |
| P0 | Device secret untuk library, LED, dan card writer disimpan di `localStorage` | XSS/local-user dapat mengekstrak credential perangkat | Gunakan OS keystore/TPM/secure element atau provisioning native; jangan gunakan browser storage untuk produksi |
| P0 | Firmware Gate Phase 06 belum ada; hanya server ingestion | Exit criteria offline/power-loss/queue/hardware tidak dapat dibuktikan | Implementasikan firmware/reference device dan fault-injection/HIL suite |
| P1 | Tidak ada CI workflow, lockfile dependency, OpenAPI semantic lint, atau route/spec drift test | Build tidak reproducible dan kontrak dapat menyimpang | Commit lockfile, CI matrix, OpenAPI validator, generated SDK, contract drift check |
| P1 | Root `npm run typecheck` hanya memeriksa API | Type error frontend dapat lolos quality gate | Tambah project references atau `typecheck:all` untuk sembilan app |
| P1 | Tidak ada browser E2E/accessibility/security test | Role UX, logout cache, dan horizontal escalation tidak tervalidasi | Playwright + axe dengan dua tenant dan seluruh persona |
| P1 | Reporting mengambil maksimum 10.000 row ke proses API untuk CSV | Memory/latency buruk dan ekspor terpotong tanpa cursor/job | Gunakan streaming cursor atau asynchronous export job/object storage |
| P1 | Metrics bersifat in-memory satu proses dan audit middleware hanya metadata, bukan before/after mutation | Restart menghapus metrics; audit belum memenuhi traceability penuh | Export OpenTelemetry/Prometheus backend dan audit transaction/outbox before-after |
| P1 | Command Center membangun HTML menggunakan nilai API tanpa escape helper | Data tenant yang terkontaminasi dapat memicu DOM XSS | Render dengan DOM/textContent atau escape seluruh nilai dinamis |
| P2 | Banyak modul baru ditulis satu baris/minified dan domain logic berada langsung di route | Review, coverage, dan maintenance sulit | Format/lint otomatis dan ekstrak service/repository/domain modules |
| P2 | Tidak ada `supabase/config.toml`, `seed.sql`, struktur `infra/`, atau deployment manifests | Environment parity dan recovery tidak reproducible | Tambah local stack, IaC, secret management, monitoring, dan runbook executable |

### Kesesuaian struktur dengan blueprint

| Area blueprint | Kondisi repositori | Penilaian |
| --- | --- | --- |
| `apps/api` dan frontend per persona | Tersedia dan terpisah per deployment/persona | Sesuai baseline |
| `services/*` bounded contexts | Belum ada; business query dan orchestration masih langsung di Express route/RPC | Belum sesuai target modular |
| `packages/api-contract`, `domain-events`, `authz`, `validation`, `observability` | Belum ada; kontrak dan helper tersebar per app | Gap arsitektur |
| `firmware/gate`, `firmware/library-terminal`, shared device primitives | Tidak ada firmware; terminal browser bukan pengganti firmware/secure client produksi | Gap kritis Phase 06/11 |
| `supabase/migrations` | 11 migrasi tersedia | Sesuai baseline, belum terbukti di database |
| `supabase/tests` | Hanya integration SQL Phase 11 | Coverage tidak memadai |
| `tests/contract`, `integration`, `e2e`, `security`, `hardware-in-loop` | Direktori/suite terpisah tidak tersedia | Gap quality engineering |
| `infra/environments`, `monitoring`, `runbooks` | Hanya runbook Markdown; IaC dan konfigurasi monitoring tidak ada | Gap operasional |

Keputusan arsitektur yang direkomendasikan adalah mempertahankan satu deployment API untuk saat ini, tetapi memecah route yang membesar menjadi application service dan tenant-aware repository per bounded context. Jangan membuat microservice baru sebelum transactional boundary, event outbox, observability, dan database test stabil.

## Status per fase

### Phase 01 — Database + Tenancy: **Partial / In progress**

**Sudah tersedia**

- Migrasi inti membuat enum dan tabel tenant, akademik, siswa, kartu, dan perangkat dengan UUID, constraint, indeks, composite foreign key, trigger `updated_at`, serta aturan satu academic year/history/card aktif.
- Migrasi lanjutan menambah tabel domain untuk device runtime, attendance, parent, dan waste.

**Belum memenuhi exit criteria**

- Tidak ada konfigurasi Supabase local/CI, seed non-production, atau automation yang membuktikan migrasi dapat diterapkan pada database kosong dan setelah reset.
- Tidak ada test database yang membuktikan FK lintas sekolah ditolak dan constraint/index bekerja pada PostgreSQL nyata.
- Runbook backup/restore awal sudah tersedia, tetapi belum ada konfigurasi provider/IaC, rollback plan yang executable, maupun bukti restore/PITR drill.

**Rekomendasi:** tambahkan `supabase/config.toml`, seed idempotent, CI `supabase db reset`, pgTAP untuk seluruh constraint tenant/lifecycle, dan runbook backup/restore dengan hasil drill.

### Phase 02 — Auth + RBAC + RLS: **Partial / In progress**

**Sudah tersedia**

- Skema menghubungkan user aplikasi dengan `auth.users`, menyediakan membership, role, permission, junction, helper authorization, grant/revoke, serta `ENABLE` dan `FORCE ROW LEVEL SECURITY` pada tabel aplikasi.
- API membentuk user client dari bearer session dan tenant context dari membership aktif; service-role key tidak tampak digunakan pada browser/PWA.

**Belum memenuhi exit criteria**

- Tidak ada seed transaksional role/permission standar.
- Tidak ada test matrix RLS nyata untuk anonymous, member aktif/nonaktif, admin sekolah A/B, parent, dan percobaan FK/UUID lintas tenant. HTTP test saat ini hanya membuktikan route tanpa token ditolak, bukan behavior policy database.
- Penyimpanan secret backend dan pemisahan environment belum dibuktikan oleh konfigurasi deployment.

**Rekomendasi:** buat seed permission terversi dan pgTAP/integration test dengan dua tenant serta JWT berbeda; jalankan di CI menggunakan Supabase lokal.

### Phase 03 — Core API: **Partial / In progress**

**Sudah tersedia**

- Express `/api/v1`, OpenAPI, Zod validation, pagination schema, correlation ID, rate limiting, security headers, structured logging, dan error envelope baku sudah terpasang.
- Route auth, current school/context, classes, students, dan health tersedia; tenant middleware membawa school, role, permission, dan Supabase user client ke request.
- Contract tests memeriksa health, 404/error envelope, validation, dan authentication boundary sejumlah resource.

**Belum memenuhi exit criteria**

- `/readiness` terpisah tidak tersedia; `/health` tidak memeriksa dependency database.
- Belum ada repository abstraction tenant-aware atau idempotency store generik; audit hook sudah ada tetapi belum menangkap before/after data secara transaksional.
- Belum ada generated TypeScript SDK, OpenAPI lint/validation di CI, real-database integration test, atau distributed tracing. Process metrics dan SLO awal sudah tersedia tetapi belum dikirim ke backend observability terpusat.

**Rekomendasi:** validasi OpenAPI pada CI, hasilkan client typed, tambah readiness/dependency checks, audit/idempotency primitives, dan integration test yang menjalankan seluruh route terhadap database dua tenant.

### Phase 04 — Student + Class + Academic Year: **Partial / In progress**

**Sudah tersedia**

- CRUD academic year, class, dan student tersedia; switch academic year dan pencatatan student class history menggunakan RPC transaksional.
- Schema Zod dan kontrak OpenAPI tersedia; constraint database melindungi uniqueness serta satu histori aktif.

**Belum memenuhi exit criteria**

- Workflow import Excel `validate → preview → confirm` tidak tersedia pada API maupun Admin PWA.
- Tidak ditemukan domain event student/class atau audit before/after.
- Tidak ada integration test promosi kelas, import ganda/parsial, overlap periode, dan immutability laporan tahun lalu.

**Rekomendasi:** prioritaskan import job idempotent dengan staging table, preview token, confirm transaction, audit/event outbox, lalu tambah regression test histori lintas tahun.

### Phase 05 — Device Management: **Partial / In progress**

**Sudah tersedia**

- Registrasi device, credential hash, heartbeat, config runtime, inventory list, dan tabel credential/heartbeat tersedia.
- Runtime menggunakan `Authorization: Device <token>` dan function database memvalidasi credential serta scope tenant.

**Belum memenuhi exit criteria**

- Tidak ada endpoint/prosedur operator untuk rotate dan revoke credential.
- `device_events`, alert error/security, firmware channel/checksum/OTA metadata dan rollback workflow belum tersedia.
- Tidak ada test integrasi cross-school, immediate revoke, backward compatibility config, atau OTA rollback.

**Rekomendasi:** tambahkan lifecycle credential lengkap, signed OTA manifest, device event ingestion, offline alert policy, dan contract matrix per versi firmware.

### Phase 06 — Gate Firmware + Offline Engine: **Partial / In progress**

**Sudah tersedia**

- Backend menyediakan realtime attendance ingestion dan batch sync dengan event UUID, sequence/timestamp, autentikasi device, validasi mode/rule, serta idempotency di function PostgreSQL.
- Schema Zod dan tests menguji batas batch serta bentuk event; OpenAPI mendokumentasikan kedua endpoint runtime.

**Belum memenuhi exit criteria**

- Tidak ada source `firmware/gate`: state machine, signed/versioned cache, RTC+NTP, queue 2.000 event, retry exponential backoff, RFID/OLED/LED/audio, watchdog, dan secure credential storage belum diimplementasikan.
- Tidak ada soak, power-loss, clock-drift, queue-full, degraded-cloud, atau hardware-in-the-loop test.

**Rekomendasi:** jangan menandai Phase 06 selesai hanya karena server ingestion tersedia; implementasikan firmware/reference simulator dan fault-injection suite sesuai exit criteria.

### Phase 07 — Admin Web: **Partial / In progress**

**Sudah tersedia**

- Admin PWA menyediakan shell login, permission-aware navigation, dashboard, serta layar/list untuk students, classes, attendance, cards, dan devices.
- Manifest dan service worker tersedia; API traffic tidak dimasukkan ke cache shell. Route guard diposisikan sebagai UX dan API/RLS tetap boundary otorisasi.

**Belum memenuhi exit criteria**

- Mayoritas workflow masih berupa read/list sederhana; import siswa, form CRUD lengkap, card/device lifecycle, dan entry module lain belum lengkap.
- Tidak ada E2E per role, automated accessibility audit, bundle/performance budget, atau test cache lintas tenant/logout.
- Typecheck root hanya mencakup API, sehingga TypeScript sembilan frontend/edge app tidak diperiksa oleh `npm run typecheck`.

**Rekomendasi:** perluas script typecheck ke seluruh app, tambah Playwright + axe, implementasikan workflow operator end-to-end, dan verifikasi purge cache/session saat logout atau tenant berpindah.

### Phase 08 — Parent PWA: **Partial / In progress**

**Sudah tersedia**

- Migrasi menyediakan profile/link/token dan RLS berbasis relasi aktif; API menyediakan claim link, children list, today timeline, dan pembuatan link token oleh operator.
- Parent PWA dapat menyimpan session, claim token, mengambil daftar anak, dan menampilkan timeline; service worker menghindari cache API.

**Belum memenuhi exit criteria**

- Tidak ada API/UI unlink atau revoke session/link, walaupun lifecycle status ada di database.
- UI hanya membuka anak pertama dan belum menyediakan profile/multi-child experience lengkap.
- Tidak ada security integration test untuk token enumeration, replay/expiry terhadap database, horizontal privilege escalation, immediate revoke, atau cache privacy setelah logout.

**Rekomendasi:** tambah revoke/unlink dan session management, child selector, one-time token lifecycle test, serta E2E dua parent/dua tenant.

### Phase 09 — Waste PWA: **Partial / In progress**

**Sudah tersedia**

- Tabel waste transaction dengan RLS, API create/ranking/summary, schema Zod, dan PWA transaksi tersedia.
- Form mendukung satuan `KG` dan `KTG`; `KTG` dikonversi ke kilogram serta memakai source `MANUAL`, sedangkan `KG` memakai `SCALE`.

**Belum memenuhi exit criteria**

- Secure class token, QR/student scanner, staff authentication flow, scale adapter, realtime/domain event `waste.created`, dan LED integration belum tersedia.
- Ranking/summary mengambil baris transaksi dan menghitung agregat di Node, bukan read model/agregat database yang scalable.
- Test hanya mencakup schema precision dasar; belum ada duplicate submission/idempotency, token expiry, scale fallback, commit-before-event, dan reconciliation test.

**Rekomendasi:** implementasikan token kelas berumur pendek, scan resolver, idempotency key + outbox event, database aggregate/view, adapter scale dengan manual fallback, dan integration reconciliation test.

### Phase 10 — Extracurricular PWA: **Partial / In progress**

Migrasi tenant-safe, RLS, kegiatan, sesi, anggota, presensi, outbox event, API, validasi, kontrak OpenAPI, dan PWA awal telah tersedia. Fast enrollment mensyaratkan konfirmasi eksplisit serta idempotency key; constraint database menolak presensi ganda dan relasi member/session lintas kegiatan atau tenant. Exit criteria belum sepenuhnya terbukti karena migration/RLS integration test pada PostgreSQL nyata, aggregate reconciliation, dan E2E PWA belum tersedia.

### Phase 11 — Library: **Partial / In progress**

Terminal PWA, device-authenticated API, `library_visits`, idempotent realtime/offline ingestion, antrean retry lokal, summary per kelas, dan outbox `library.visit.created` telah tersedia. Composite FK dan RPC mengikat visit ke tenant perangkat. SQL integration suite dua tenant sudah ditulis, tetapi belum dapat dijalankan di environment audit; exit criteria masih memerlukan eksekusi suite, fault test antrean browser, dan rekonsiliasi summary terhadap PostgreSQL nyata.

### Phase 12 — LED Gateway: **Partial / In progress**

Migrasi tenant-safe, state selection berprioritas, override window dengan auto-expiry, heartbeat, acknowledgement, device-authenticated API, cache/fallback gateway, adapter Huidu, UI, validasi, dan OpenAPI telah tersedia. Exit criteria masih memerlukan PostgreSQL/RLS integration test, event replay test, dan hardware-in-the-loop terhadap controller Huidu aktual.

### Phase 13 — Command Center: **Partial / In progress**

Snapshot cache tenant harian, server-side aggregate untuk attendance/late/waste/library/extracurricular, endpoint `/dashboard/today`, permission `dashboard.read`, polling/invalidation refetch, dan UI fresh/stale/degraded telah tersedia. Exit criteria masih memerlukan PostgreSQL reconciliation test, load test jam masuk sekolah, serta pengukuran freshness SLO pada staging.

### Phase 14 — Card Writer: **Partial / In progress**

Job queue tenant-safe, lease/attempt/retry, station device authentication, server-selected identity, RFID/QR read-back verification, hard mismatch failure, immutable write log, API, validation, dan station UI telah tersedia. Exit criteria masih memerlukan PostgreSQL concurrency/crash-recovery integration test dan hardware test terhadap writer RFID/QR aktual.

### Phase 15 — Reporting + Audit + Monitoring: **Partial / In progress**

Reporting/CSV tenant-scoped untuk attendance, waste, library, dan extracurricular; audit append-only; konfigurasi retention; metrics terproteksi; correlation logging; Operations UI; serta runbook SLO, incident, privacy, backup/restore, dan sign-off telah tersedia. Exit criteria masih memerlukan deployment observability terpusat, report reconciliation di PostgreSQL, penetration test, restore/DR drill aktual, alert exercise, dan sign-off operasional.

## Audit kontrak OpenAPI

`docs/openapi.yaml` memuat 55 path untuk fitur Phase 03–15, termasuk Reporting, Audit, dan Monitoring. Seluruh fase kini memiliki permukaan kontrak awal.

Kekurangan proses kontrak:

- OpenAPI belum divalidasi oleh linter/parser dalam script test/CI dan belum dibandingkan otomatis dengan route Express.
- Generated SDK TypeScript belum tersedia.
- Test app hanya memeriksa sebagian boundary/status; test tidak menjalankan contoh request/response OpenAPI terhadap Supabase nyata.

## Hasil pengujian otomatis

| Perintah | Hasil | Catatan |
| --- | --- | --- |
| `npm run typecheck` | Pass | `tsc -p apps/api/tsconfig.json --noEmit`; hanya API yang tercakup. |
| `npm test` | Pass | 14 test files, 77 tests lulus. |
| Seluruh script `build*` | Pass | API dan sembilan frontend/edge app menghasilkan build production. |
| Parse `docs/openapi.yaml` dengan Ruby YAML | Pass | OpenAPI 3.1.0 versi 1.12.0, 55 path; ini validasi sintaks YAML, bukan semantic OpenAPI lint. |
| Pemeriksaan tabel/RLS statis | Pass | 37 dari 37 tabel mempunyai `ENABLE ROW LEVEL SECURITY`; ditemukan 62 policy. |
| `npm run test:db:library` | Blocked | Membutuhkan `DATABASE_URL`, `psql`, dan database disposable; runner tidak melakukan silent skip. |

Test yang lulus memberi keyakinan pada type safety API, schema validation, error/auth boundary dasar, dan permission helper. Test tersebut **belum** memberi bukti bahwa migrasi SQL valid di PostgreSQL, RLS mengisolasi tenant, seluruh OpenAPI valid, atau PWA/hardware memenuhi exit criteria.

## Urutan remediasi yang direkomendasikan

1. **P0 — Buktikan database/security:** Supabase local CI, migration reset, seed RBAC, pgTAP/RLS dua tenant, signature RPC, FK/lifecycle/idempotency/concurrency test.
2. **P0 — Hilangkan penyimpanan device secret di browser:** pindahkan terminal/gateway/station produksi ke runtime native dengan OS keystore/TPM dan rotation/revocation teruji.
3. **P0 — Selesaikan Gate firmware:** queue ≥2.000, cache bertanda versi, clock, backoff, watchdog, power-loss recovery, dan HIL.
4. **P1 — Tutup workflow bisnis:** import akademik validate-preview-confirm, device rotate/revoke/OTA, Parent unlink/revoke, Waste secure class token/scale/outbox, serta UI CRUD operator lengkap.
5. **P1 — Quality gate repository:** lockfile, CI, typecheck seluruh app, lint/format, OpenAPI semantic validation + generated SDK, Playwright/axe, dan security regression.
6. **P1 — Production evidence:** centralized observability, report reconciliation, load/soak/fault test, penetration test, backup restore/DR drill, privacy/export review, dan sign-off.

## Kesimpulan

Repositori telah menyediakan initial vertical slice untuk **seluruh Phase 01–15**, tetapi belum merupakan sistem production-ready. Baseline yang dapat dipertanggungjawabkan adalah **0 Done, 15 Partial, 0 Not started**. Fokus berikutnya harus bergeser dari penambahan surface area menuju pembuktian: migrasi/RLS nyata, secure device storage, firmware/hardware behavior, E2E multi-role, observability terpusat, dan drill operasional. Status **Done** hanya boleh diberikan setelah exit criteria terkait mempunyai hasil otomatis atau bukti sign-off yang reproducible.
