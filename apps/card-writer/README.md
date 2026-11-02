# AKSIS Card Writer Station

## Overview
Web Serial hardware station interface for writing, encoding, and verifying NFC/RFID smart cards paired with physical QR keys for students.

## Interface
- `SerialCardAdapter`: Web Serial API wrapper communicating with hardware NFC readers/writers (`.connect()`, `.read()`, `.write()`).
- `Job`: Card writing job model (`id`, `lease_token`, `lease_expires_at`, `student_name`, `expected_uid`, `expected_rfid`, `expected_qr`).
- `QRCamera`: Camera scanner for scanning physical cards during QC verification.

## Invariants
- Enforces mutual two-factor binding: a card cannot be finalized without verifying both the physical chip UID/payload and the printed QR code.
- Job leases expire after 300 seconds (`lease_seconds: 300`) if not finalized or released.
- Hardware credentials and device tokens stay strictly in client memory (`sessionStorage`) and are never written to persistent disk storage.

## Side Effects
- Opens hardware serial ports via Web Serial API (`navigator.serial`).
- Claims and completes writing jobs via `/device/card-writer/jobs/claim` and `/device/card-writer/jobs/complete`.
- Dispatches device heartbeats every 30 seconds to `/devices/heartbeat`.

## Verification
- Run: `npm run build:card-writer && npm test`
