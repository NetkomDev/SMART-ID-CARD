# AKSIS Extracurricular PWA (Portal Ekstrakurikuler)

## Overview
Progressive Web App (PWA) for extracurricular instructors and coaches ("Portal Ekstrakurikuler"). Enables activity selection, session creation, member roster tracking, student attendance recording via QR/card scan, and enrollment management.

## Interface
- `EkskulAttendanceRecord`: Record payload (`event_id`, `ekskul_id`, `session_id`, `student_id`, `student_name`, `status`, `occurred_at`).
- `selectEkskul(id, name)`: Activates an extracurricular activity context and initializes today's session.
- `QRCamera`: Tap-to-scan QR camera scanner with auto-centering and single-shot automatic shutoff upon decode.
- `DurableQueue<EkskulAttendanceRecord>`: Client-side persistent offline queue.
- `StudentCache`: School-isolated local student data cache.
- `PortalSession("TEACHER")`: Teacher session authenticator and token bearer.

## Invariants
- An active `session_id` must be established before scanning student attendance.
- Scans verify that the student is enrolled in the selected extracurricular activity; non-enrolled students trigger an enrollment confirmation prompt.
- Queue keys are scoped strictly to `ekskul_attendance:<school_id>:<staff_id>` preventing cross-tenant leakage.

## Side Effects
- Mutates IndexedDB / local storage queues for pending attendance events.
- Dispatches HTTP requests to `/extracurriculars/:id/sessions` and `/extracurriculars/attendance`.
- Plays audio confirmations with student names via the NaturalVoice speech engine.

## Verification
- Run: `npm run build:extracurricular && npm test`
