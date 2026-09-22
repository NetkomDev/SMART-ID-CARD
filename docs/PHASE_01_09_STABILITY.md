# Phase 01–09 Stability Check

**Checked:** 22 September 2026

## Result

The repository-level quality gates pass after completing the Waste PWA `KG`/`KTG` transaction flow:

| Gate | Result | Scope |
| --- | --- | --- |
| `npm run typecheck` | Pass | Core API TypeScript project |
| `npm test` | Pass | 6 files, 35 tests |
| `npm run build` | Pass | Core API production compilation |
| `npm run build:admin` | Pass | Admin PWA production bundle |
| `npm run build:parent` | Pass | Parent PWA production bundle |
| `npm run build:waste` | Pass | Waste PWA production bundle |

The Waste PWA now normalizes both accepted units before submission. `KG` retains the entered value and is marked `SCALE`; `KTG` uses `0.5 kg` per bag, rounds to three decimal places, and is marked `MANUAL`. The calculated `total_kg` is used by the UI, while the API receives `organic_kg` and `inorganic_kg`; PostgreSQL derives its stored `total_kg` generated column from those normalized fields.

## Stability boundary

These green gates cover static typing, unit/HTTP contract tests, and production compilation for the Phase 01–09 code currently in the repository. They do not yet validate migrations or RLS against a live PostgreSQL/Supabase instance.

The next quality gate should provision two isolated schools in a disposable Supabase database and verify:

1. migrations apply cleanly from an empty database and after reset;
2. anonymous, inactive-member, active-member, parent, staff, and device access matrices;
3. cross-school reads, writes, foreign keys, and RPC calls are rejected;
4. privileged service-role operations remain backend-only; and
5. generated columns and lifecycle/idempotency constraints behave under concurrent writes.
