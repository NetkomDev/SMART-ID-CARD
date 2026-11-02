# AKSIS Core API

## Overview
Node.js/Express implementation of the integrated Phase 03–06 `/api/v1` contract. Database calls use the Supabase anonymous key plus the caller's bearer token so PostgreSQL RLS remains the final authorization boundary. Never configure a service-role key in this application.

### Run locally
```bash
cp .env.example .env
npm install
npm run dev
```

Authenticated tenant routes require both `Authorization: Bearer <access-token>` and `X-School-Id: <school-uuid>`. Login, refresh, health, and API validation do not require a tenant header. See `docs/openapi.yaml` for the complete contract.

Device registration uses human tenant authentication and returns a random credential exactly once. Devices subsequently call heartbeat/config with `Authorization: Device <token>` and `X-Device-Id`; the database derives `school_id` from that authenticated device and never trusts a device-supplied tenant identifier.

## Interface
| Phase | Resource | Routes | Authentication |
| --- | --- | --- | --- |
| 03 | Auth | `/auth/login`, `/auth/refresh`, `/auth/session`, `/auth/logout` | Public for login/refresh; bearer token for session/logout |
| 03 | Tenant core | `/schools/current`, `/classes`, `/students` | Bearer token + `X-School-Id` + RBAC/RLS |
| 04 | Academic periods | `/academic-years`, `/academic-years/switch` | Bearer token + tenant + `academic.manage` for writes |
| 04 | Student history | `/students/:id/history` | Bearer token + tenant + `student.read`/`student.update` |
| 04 | Cards | `/cards` | Bearer token + tenant + `card.read`/`card.manage` |
| 05 | Device provisioning | `/devices/register` | Bearer token + tenant + `device.manage` |
| 05 | Device runtime | `/devices/heartbeat`, `/devices/config` | `Device` token + `X-Device-Id` |
| 06 | Gate attendance | `/device/attendance`, `/device/attendance/sync` | `Device` token + `X-Device-Id`; tenant derived by database |

### Code Layout
- `routes/`: HTTP orchestration only.
- `schemas/`: Zod request contracts.
- `middleware/`: authentication, tenant/RBAC context, validation, and error handling.
- `lib/`: Supabase adapter, logging, errors, and response helpers.

## Invariants
- All tenant-aware human routes require valid JWT and matching `X-School-Id` verified against tenant membership.
- Device runtime routes intentionally bypass human JWT middleware and authenticate inside tenant-safe database RPCs.
- Service-role credentials are strictly forbidden in this application; PostgreSQL RLS is always enforced.
- The canonical request/response contract is defined in `docs/openapi.yaml`.

## Side Effects
- Reads/writes to PostgreSQL database via Supabase PostgREST and RPC endpoints.
- Issues HTTP audit logs and Prometheus-compatible runtime metrics.

## Verification
- Run: `npm run typecheck && npm test && npm run build`

