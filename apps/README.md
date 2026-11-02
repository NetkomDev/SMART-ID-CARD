# AKSIS Applications (`apps/`)

## Overview
Intermediate blueprint organizing all frontend applications, progressive web apps (PWAs), terminal kiosks, and backend service modules comprising the AKSIS multi-school smart card platform.

## Subdirectories & Boundaries
- [admin-web](./admin-web/README.md): PWA for school administrators and operational management.
- [api](./api/README.md): Node.js/Express Core API providing `/api/v1` endpoints with Supabase RLS.
- [attendance-pwa](./attendance-pwa/README.md): Gate attendance PWA for student check-in and check-out tracking.
- [card-writer](./card-writer/README.md): Web Serial station interface for NFC/RFID smart card encoding and verification.
- [command-center](./command-center/README.md): Real-time KPI monitor for school operations wall displays.
- [extracurricular-pwa](./extracurricular-pwa/README.md): Activity coach PWA for extracurricular sessions and attendance.
- [led-gateway](./led-gateway/README.md): Gateway bridge and simulator for school LED matrix displays.
- [library-terminal](./library-terminal/README.md): Library terminal kiosk for visitor attendance and book circulation.
- [operations-console](./operations-console/README.md): Administrative CSV reporting and data export console.
- [parent-pwa](./parent-pwa/README.md): Family portal monitoring student presence, waste banking, and school activities.
- [shared](./shared/README.md): Common client modules, design tokens, durable queues, and camera utilities.
- [waste-pwa](./waste-pwa/README.md): School waste bank PWA for student waste deposit weighing and recording.
