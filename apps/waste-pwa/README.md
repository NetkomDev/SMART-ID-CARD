# AKSIS Waste PWA (Piket Bank Sampah)

## Overview
Progressive Web App (PWA) for school waste collection officers ("Piket Bank Sampah"). Allows officers to record organic and inorganic waste deposits per student using QR scan or manual student number entry, calculate measurements, and sync transactions offline-first.

## Interface
- `WasteQueueItem`: Queue payload record (`event_id`, `class_id`, `student_id`, `student_name`, `organic_kg`, `inorganic_kg`, `source`, `total_kg`, `occurred_at`).
- `calculateWasteMeasurement(type, unit, rawValue)`: Measurement conversion utility for waste metrics.
- `QRCamera`: Tap-to-scan camera integration with auto-centering and automatic shutoff upon QR detection.
- `NaturalVoice`: Voice feedback greeting announcing student names and status.
- `DurableQueue<WasteQueueItem>`: Offline persistence layer scoped to school and staff session.
- `StudentCache`: Offline roster cache partitioned per school tenant.
- `showSyncBar(active)`: Discreet 3px progress bar for non-blocking silent queue sync and roster refresh.
- `updateOfflineStatus()`: Controls `#offline-badge` display during offline weighing sessions.

## Invariants
- Database transactions use the `WASTE_STAFF` portal token; tenant authorization is derived server-side via Supabase RLS.
- Offline transactions are queued locally under `waste_deposits:<school_id>:<staff_id>` and never cross tenant boundaries.
- Total deposit weight equals `organic_kg + inorganic_kg` and must be non-negative.
- The PWA install prompt is offered immediately on browser load if not already running in standalone mode (`!isInstalled()`).
- Background sync must never present blocking modal overlays (`#loading-overlay`); all transactional state sync is indicated via `#sync-bar`.
- Offline status is indicated via `#offline-badge` without impeding the student weighing or card scanning process.

## Side Effects
- Reads/writes indexed offline transaction queues in browser `IndexedDB` / `localStorage`.
- Syncs pending deposits to backend endpoint `/waste/deposits` when online.
- Plays audio synthesis for student name verification using the Web Speech API.
- Accesses device camera for QR code scanning.

## Verification
- Run: `npm run build:waste && npm test`
