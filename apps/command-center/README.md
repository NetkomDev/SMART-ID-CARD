# AKSIS Command Center

## Overview
Lightweight dashboard application designed for high-visibility wall monitors and school command centers. Displays live operational KPIs across daily attendance, waste bank deposits, library visits, and extracurricular attendance.

## Interface
- `Snapshot`: Metrics container (`attendance`, `waste`, `library`, `extracurricular`, `generated_at`, `stale_after`).
- `freshness(stale_after, now, online)`: Utility computing visual status pills (`FRESH`, `STALE`, `OFFLINE`).
- `OperatorSession`: Session controller scoped to the operator role.

## Invariants
- Polls `/dashboard/today` every 30 seconds; caches the latest snapshot in `sessionStorage`.
- Uses school-scoped authentication tokens (`Authorization: Bearer <token>` + `X-School-Id`).
- Automatically transitions into offline cached display if the network drops.

## Side Effects
- Mutates `sessionStorage` for snapshot caching under key `aksis.command.snapshot.v2.<scope>`.
- Emits network requests to `/dashboard/today`.

## Verification
- Run: `npm run build:command && npm test`
