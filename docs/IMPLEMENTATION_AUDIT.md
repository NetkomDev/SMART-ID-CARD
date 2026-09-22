# Audit Implementasi terhadap Technical Execution Roadmap

**Tanggal audit:** 22 September 2026  
**Baseline:** commit `2dec180` (`Introduce AKSIS Core API, Admin/Parent/Waste PWAs, OpenAPI and DB migrations`)  
**Ruang lingkup:** pemeriksaan statis seluruh berkas yang dilacak Git serta eksekusi typecheck dan unit/contract test lokal.

## Ringkasan eksekutif

Roadmap mendefinisikan 15 fase dengan Definition of Done (DoD) lintas fase yang mencakup test otomatis, tenant-isolation test, observability, dokumentasi, dan threat review. Audit tidak memberi status **Done** hanya berdasarkan keberadaan source code; seluruh exit criteria fase juga harus mempunyai bukti yang dapat dijalankan atau artefak operasional.

| Status | Jumlah | Fase |
| --- | ---: | --- |
| Done | 0 | — |
| Partial / In progress | 10 | 01–10 |
| Not started | 5 | 11–15 |

Fondasi produk sudah cukup luas: lima migrasi SQL, Core API dengan 31 path OpenAPI, tiga PWA, dan 33 unit/contract test. Namun belum ada bukti migrasi dijalankan pada PostgreSQL/Supabase kosong, test RLS/tenant isolation riil, test integrasi database, E2E browser, firmware, hardware-in-the-loop, infrastruktur observability, backup/restore drill, atau production-readiness review. Karena itu, fase 01–09 belum memenuhi DoD roadmap secara penuh.

## Metode dan inventaris

Audit dilakukan dengan:

1. Membaca seluruh tujuan, deliverable, dependency, dan exit criteria Phase 01–15 di `TECHNICAL_EXECUTION_ROADMAP.md`.
2. Menginventarisasi migrasi, route, middleware, schema Zod, test, PWA, dan path OpenAPI.
3. Menelusuri kata kunci dan artefak yang diwajibkan roadmap (import, audit, revoke/rotate, firmware, extracurricular, library, LED, command center, card writer, reporting, monitoring, dan runbook).
4. Menjalankan `npm run typecheck` dan `npm test` dari root repositori.

Artefak utama yang ditemukan:

- Migrasi: fondasi tenancy/RBAC; academic/cards/devices; gate attendance; parent access; dan waste.
- API: auth, school, class, student, academic year, student history, card, device, gate attendance, attendance read model, parent, dan waste.
- Middleware: human auth, tenant/permission context, request validation, error handler, correlation ID, rate limit, CORS, Helmet, dan structured HTTP logging.
- PWA: `admin-web`, `parent-pwa`, dan `waste-pwa` dengan manifest/service worker masing-masing.
- Test otomatis: enam test file, seluruhnya unit/HTTP contract ringan; tidak ditemukan suite `supabase/tests`, `tests/integration`, `tests/e2e`, `tests/security`, atau `tests/hardware-in-loop`.

## Status per fase

### Phase 01 — Database + Tenancy: **Partial / In progress**

**Sudah tersedia**

- Migrasi inti membuat enum dan tabel tenant, akademik, siswa, kartu, dan perangkat dengan UUID, constraint, indeks, composite foreign key, trigger `updated_at`, serta aturan satu academic year/history/card aktif.
- Migrasi lanjutan menambah tabel domain untuk device runtime, attendance, parent, dan waste.

**Belum memenuhi exit criteria**

- Tidak ada konfigurasi Supabase local/CI, seed non-production, atau automation yang membuktikan migrasi dapat diterapkan pada database kosong dan setelah reset.
- Tidak ada test database yang membuktikan FK lintas sekolah ditolak dan constraint/index bekerja pada PostgreSQL nyata.
- Tidak ada artefak backup, PITR, rollback plan, atau restore drill di `infra/`/runbook.

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
- Belum ada repository abstraction tenant-aware, audit hook, atau idempotency store generik seperti yang diminta roadmap.
- Belum ada generated TypeScript SDK, OpenAPI lint/validation di CI, real-database integration test, SLO awal, atau metrics/tracing.

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
- Typecheck root hanya mencakup API, sehingga TypeScript ketiga PWA tidak diperiksa oleh `npm run typecheck`.

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

### Phase 11 — Library: **Not started**

Enum device telah mengenal `LIBRARY`, tetapi tidak ada `library_visits`, terminal/client, API, offline retry, summary, event, atau test. Enum saja bukan implementasi fase.

### Phase 12 — LED Gateway: **Not started**

Enum device telah mengenal `LED`, tetapi tidak ada gateway, Huidu adapter, priority state machine, override window/acknowledgement, heartbeat khusus, atau hardware-in-the-loop test.

### Phase 13 — Command Center: **Not started**

Tidak ada app command center, endpoint `/dashboard/today`, materialized aggregate/cache, realtime invalidation, freshness SLO, load test, atau degraded-state UI.

### Phase 14 — Card Writer: **Not started**

Card CRUD yang ada hanya mengelola identitas/status kartu. Tidak ada writer job queue, lease/attempt/retry, station workflow, RFID/QR read-back, immutable write log, concurrency/crash recovery, atau hardware test.

### Phase 15 — Reporting + Audit + Monitoring: **Not started**

Pino HTTP log dasar tersedia, tetapi fase ini memerlukan reporting/export lintas domain, audit append-only, retention/privacy, centralized logs, metrics, tracing, alerting, SLO/error budget, runbook, penetration test, DR/restore drill, dan sign-off operasional. Tidak ditemukan artefak yang cukup untuk menyatakan fase dimulai sebagai deliverable terpadu.

## Audit kontrak OpenAPI

`docs/openapi.yaml` memuat 38 path untuk fitur Phase 03–10 yang ada, termasuk kegiatan ekstrakurikuler, sesi, anggota, fast enrollment, presensi, dan summary. Tidak ditemukan path Phase 11–15.

Kekurangan proses kontrak:

- OpenAPI belum divalidasi oleh linter/parser dalam script test/CI dan belum dibandingkan otomatis dengan route Express.
- Generated SDK TypeScript belum tersedia.
- Test app hanya memeriksa sebagian boundary/status; test tidak menjalankan contoh request/response OpenAPI terhadap Supabase nyata.

## Hasil pengujian otomatis

| Perintah | Hasil | Catatan |
| --- | --- | --- |
| `npm run typecheck` | Pass | `tsc -p apps/api/tsconfig.json --noEmit`; hanya API yang tercakup. |
| `npm test` | Pass | 6 test files, 33 tests lulus. |
| `npm run build && npm run build:admin && npm run build:parent && npm run build:waste` | Pass | API dan ketiga PWA menghasilkan build production. |
| `npx tsc -p apps/<app>/tsconfig.json --noEmit` | Pass | Dijalankan terpisah untuk `admin-web`, `parent-pwa`, dan `waste-pwa`. |

Test yang lulus memberi keyakinan pada type safety API, schema validation, error/auth boundary dasar, dan permission helper. Test tersebut **belum** memberi bukti bahwa migrasi SQL valid di PostgreSQL, RLS mengisolasi tenant, seluruh OpenAPI valid, atau PWA/hardware memenuhi exit criteria.

## Urutan remediasi yang direkomendasikan

1. **P0 — Security/database proof:** Supabase local CI, migration reset, seed RBAC, pgTAP RLS dua tenant, FK/lifecycle tests, dan secret/deployment review.
2. **P0 — Contract correctness:** OpenAPI lint + generated SDK + API/database integration tests; tambahkan readiness, audit trail, dan idempotency primitive.
3. **P1 — Tutup workflow Phase 04–09:** academic import, device revoke/rotate/OTA, firmware Gate, Admin E2E, Parent revoke, dan Waste secure token/idempotency/outbox.
4. **P1 — Quality gates:** typecheck/build semua PWA, Playwright/axe, cache privacy, load/fault tests, observability, backup/restore runbook.
5. **P2 — Fase baru:** mulai Phase 10 hanya setelah fondasi dan exit criteria keamanan fase sebelumnya terukur; lanjutkan dependency order Library → LED → Command Center → Card Writer → production readiness.

## Kesimpulan

Repositori telah mengimplementasikan vertical slice yang berarti untuk Phase 01–09, tetapi status release roadmap lebih rendah daripada status keberadaan kode. Baseline yang aman adalah **9 fase partial dan 6 fase not started**. Fokus berikutnya sebaiknya bukan menambah permukaan fitur baru, melainkan membuktikan tenant isolation/database behavior, menutup workflow yang hilang, dan mengotomasi acceptance criteria agar istilah **Done** mempunyai bukti yang reproducible.
