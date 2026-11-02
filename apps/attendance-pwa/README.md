# AKSIS Attendance PWA (Piket Kehadiran Gerbang)

## Overview
Progressive Web App (PWA) for gate attendance officers ("Piket Kehadiran Gerbang"). Enables officers to record student check-in and check-out events at school gates with offline verification against schedule rules, audio greetings, and background synchronization.

## Interface
- `Direction`: Gate direction type (`"CHECK_IN" | "CHECK_OUT"`).
- `ScanRecord`: Local attendance record (`event_id`, `identifier`, `direction`, `occurred_at`, `student_id`, `status`, etc.).
- `Snapshot`: Encapsulates offline school rules, timezone, today's records, and student roster.
- `compliance(direction, time, rules)`: Calculates attendance compliance (on-time, late, early departure).
- `attendanceGreeting(student_name, direction, is_late)`: Formulates text-to-speech audio feedback.
- `QRCamera`: Tap-to-scan camera integration with auto-centering and single-shot automatic shutoff.
- `PortalSession("GATE_STAFF")`: Session state and token lifecycle manager.

## Invariants
- Operates offline for up to 7 days using the cached school rules and roster snapshot with 0ms cold-start kiosk readiness.
- Duplicate scans for the same student in the same direction on the same school day are prevented locally.
- Server timestamp calibration prevents clock skew manipulation; clock drift > 5 minutes requires resynchronization.
- Scans are queued in local IndexedDB/localStorage until acknowledged by the backend `/device/attendance/sync` or `/attendance` API.
- Background sync must never present blocking modal overlays (`#loading-overlay`); all transactional state sync is indicated via top progress bar `#sync-bar`.
- Offline status is actively indicated via `#offline-badge` without interrupting active camera gate scanning.

## Side Effects
- Mutates local IndexedDB storage for offline attendance records and sync flags.
- Submits batch attendance payloads to the backend API when network connectivity is present.
- Emits voice feedback through the Web Speech API and device vibration via the Vibration API.
- Streams video input from the rear/front camera during active scanning.

## Verification
- Run: `npm run build:attendance && npm test`
