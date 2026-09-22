# Phase 11 Library — PostgreSQL/RLS Integration Test

**Prepared:** 22 September 2026  
**Suite:** `supabase/tests/phase_11_library_integration.sql`

## Coverage

The transactional test provisions two schools with separate staff identities, RBAC grants, academic data, students, cards, library devices, and hashed device credentials. It verifies:

1. **Multi-tenant RLS isolation:** authenticated staff A only sees school A visits and staff B only sees school B visits.
2. **Cross-tenant device credential rejection:** school B's device secret cannot authenticate school A's device ID; PostgreSQL must raise SQLSTATE `28000`.
3. **Idempotency/replay prevention:** replaying an existing `event_id` returns `duplicate=true` while visit and `library.visit.created` event counts remain one.
4. **Summary reconciliation:** per-school/per-class aggregates exactly match the deterministic source transaction fixture.

All fixtures execute inside one transaction and end with `ROLLBACK`.

## Execution status in this workspace

- API typecheck and the existing Vitest suite pass.
- A structural assertion of the SQL suite passes for both tenant identities, credential mismatch coverage, replay assertions, reconciliation assertion, and rollback cleanup.
- Live execution is **environment-blocked**: this workspace has no `psql`, Supabase CLI, Docker daemon, or `DATABASE_URL`. An attempted package installation could not reach the configured Ubuntu repositories.
- `npm run test:db:library` therefore fails fast with the required `DATABASE_URL` message instead of silently skipping database assertions.

This report does not claim that PostgreSQL/RLS assertions passed until the script exits successfully against a migrated disposable Supabase database.

## Required staging command

```bash
export DATABASE_URL='postgresql://postgres:...@...:5432/postgres'
npm run test:db:library
```

The supplied URL must target a disposable database with every migration applied in timestamp order. The command uses `ON_ERROR_STOP`, so any failed RLS, credential, replay, or reconciliation assertion produces a non-zero exit status.
