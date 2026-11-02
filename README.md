# AKSIS Platform Blueprint

## System Overview
AKSIS is an integrated multi-school smart card platform (`www.aksis.co.id`) providing end-to-end digital campus operations. The system incorporates NFC/RFID smart ID cards, gate attendance tracking with TTS audio greetings, school waste banking ("Piket Bank Sampah"), extracurricular coaching logs, library terminal circulation, parent supervision portals, and hardware card encoding stations.

## Local Interface & Invariants
- `package.json`: Monorepo build, verification, and runtime script definitions.
- `vitest.config.ts`: Automated test orchestration configuring 50 unit and integration test suites.
- `vercel.json`: Production edge routing, security headers, and reverse-proxy rewrite rules.

## Subdirectories & System Boundaries
- [apps](./apps/README.md): Intermediate blueprint organizing all frontend applications, progressive web apps (PWAs), kiosks, and backend modules.
  - [apps/admin-web](./apps/admin-web/README.md): Responsive school management dashboard PWA.
  - [apps/api](./apps/api/README.md): Node.js/Express Core API engine with PostgreSQL RLS authorization.
  - [apps/attendance-pwa](./apps/attendance-pwa/README.md): Gate attendance tracking PWA with offline verification.
  - [apps/card-writer](./apps/card-writer/README.md): Web Serial station interface for smart card encoding.
  - [apps/command-center](./apps/command-center/README.md): Wall-mounted live KPI monitoring display.
  - [apps/extracurricular-pwa](./apps/extracurricular-pwa/README.md): Extracurricular activity session and attendance portal.
  - [apps/led-gateway](./apps/led-gateway/README.md): School LED matrix announcement gateway and simulator.
  - [apps/library-terminal](./apps/library-terminal/README.md): Library visitor and book loan kiosk terminal.
  - [apps/operations-console](./apps/operations-console/README.md): Administrative CSV reporting and audit export console.
  - [apps/parent-pwa](./apps/parent-pwa/README.md): Parent supervision portal monitoring attendance and waste deposits.
  - [apps/shared](./apps/shared/README.md): Shared client libraries (offline queues, camera, TTS voice, session handlers).
  - [apps/waste-pwa](./apps/waste-pwa/README.md): School waste bank deposit recording PWA.
- [api](./api/README.md): Serverless function request dispatcher bridge deployed on Vercel.
- [firmware](./firmware/README.md): Microcontroller firmware subsystem for card station hardware.
  - [firmware/esp32-pn532-card-station](./firmware/esp32-pn532-card-station/README.md): ESP32 + PN532 card writer station firmware.
- [supabase](./supabase/README.md): PostgreSQL database migrations, RLS policies, RPC functions, and test fixtures.

## Global Invariants
- **Database Row-Level Security (RLS)**: PostgreSQL RLS is the authoritative security boundary across all human and portal requests; client applications connect using anonymous/authenticated keys and never store or accept service-role credentials.
- **Tenant Isolation**: All database operations and client queues are strictly partitioned by `school_id`. No cross-tenant data leakage is permitted.
- **Offline-First PWA Resilience**: Scanners operate offline using durable queues (`DurableQueue`) and local rosters (`StudentCache`), syncing to backend services when connectivity resumes.
- **PWA Scanner Standard**: Mobile scanners use interactive tap-to-scan with smooth auto-centering on viewport, single-shot auto-shutoff upon QR decode, and automatic install prompt gating.

## Global Side Effects
- Mutates PostgreSQL database state on Supabase cloud instances.
- Reads and updates client-side IndexedDB and localStorage caches.
- Emits Web Serial transmissions to connected hardware card writing stations.
- Deploys static bundles and edge serverless endpoints to Vercel production (`www.aksis.co.id`).

## System Verification
- Run: `npm test && npm run typecheck:all && npm run vercel-build`
