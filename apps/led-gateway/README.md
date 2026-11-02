# AKSIS LED Gateway Simulator

## Overview
Web-based gateway and display simulator for school LED matrix displays ("AKSIS LED — Simulator"). Periodically syncs bulletin states, announcements, and priority alerts from the Core API with hardware controller emulation and heartbeats.

## Interface
- `SimulatorLedAdapter`: Hardware simulator interface providing `.render(content)` and `.fallback(text)`.
- `GatewayState`: Encapsulates display mode (`LIVE` vs `FALLBACK`), priority, and payload.
- `LedContent`: Bulletin model containing `id`, `version`, `priority`, and `title`.
- `mountDevicePairing(callback)`: Pairing helper binding `x-device-id` and `Device <token>`.

## Invariants
- Authenticates using device credentials (`Authorization: Device <token>` + `X-Device-Id`), bypassing user session tokens.
- Renders fallback content (`AKSIS • Informasi sekolah`) whenever network or API state retrieval fails.
- Heartbeat signals are dispatched every 60 seconds with current firmware and controller status.

## Side Effects
- Mutates `localStorage` to cache the latest active `LedContent`.
- Emits periodic state polling (`GET /device/led/state`) and heartbeats (`POST /device/led/heartbeat`).
- Posts display acknowledgement receipts to `/device/led/acknowledgements`.

## Verification
- Run: `npm run build:led && npm test`
