# AKSIS Core API

Node.js/Express implementation of the Phase 03 `/api/v1` contract. Database calls use the Supabase anonymous key plus the caller's bearer token so PostgreSQL RLS remains the final authorization boundary. Never configure a service-role key in this application.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

Authenticated tenant routes require both `Authorization: Bearer <access-token>` and `X-School-Id: <school-uuid>`. Login, refresh, health, and API validation do not require a tenant header. See `docs/openapi.yaml` for the complete contract.

## Layout

- `routes/`: HTTP orchestration only.
- `schemas/`: Zod request contracts.
- `middleware/`: authentication, tenant/RBAC context, validation, and error handling.
- `lib/`: Supabase adapter, logging, errors, and response helpers.

Run `npm run typecheck`, `npm test`, and `npm run build` before deployment.
