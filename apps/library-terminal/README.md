# AKSIS Library Terminal (Portal Perpustakaan)

## Overview
Progressive Web App (PWA) kiosk and terminal for school library staff ("Portal Perpustakaan"). Supports recording daily visitor attendance, managing book loans/returns, scanning student cards, and viewing active borrow lists with offline queueing support.

## Interface
- `Visit`: Library visitor check-in payload (`event_id`, `card_uid`, `occurred_at`, `local_sequence`, `metadata`).
- `QRCamera`: Tap-to-scan QR code reader for both visitor check-ins and book loan operations.
- `DurableQueue<Visit>`: Offline persistence queue for unrecorded visits.
- `StudentCache`: School-scoped student profile resolver.
- `NaturalVoice`: Voice feedback audio synthesizer.
- `PortalSession("LIBRARY_STAFF")`: Staff session and authorization management.

## Invariants
- Duplicate visits for the same student within the same session debounce window are flagged to prevent duplicate count inflation.
- Visitor records and book borrow events are tenant-isolated by the portal session's `school_id`.
- The PWA install modal is prompted on browser startup if the app is not already launched from the home screen (`!isInstalled()`).

## Side Effects
- Mutates IndexedDB / browser storage for offline visit and loan queues.
- Executes background synchronization loops every ~8.5 seconds to dispatch pending visits to `/library/visits`.
- Queries catalog and loan status from `/library/loans`.

## Verification
- Run: `npm run build:library && npm test`
