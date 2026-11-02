# AKSIS Supabase Database & Migrations (`supabase/`)

## Overview
Authoritative PostgreSQL database migrations, Row Level Security (RLS) policies, RPC functions, and test fixtures managing the multi-tenant data architecture for the AKSIS smart school platform.

## Interface
- `migrations/`: Sequential SQL migration scripts defining core tenancy, RBAC, academic periods, smart cards, gate attendance, waste banking, extracurricular activities, and library circulation.
- `seed.sql`: Baseline development and testing database fixtures.
- `tests/`: Integration test suites validating RLS isolation and RPC contracts (`npm run test:db:library`).

## Invariants
- Multi-tenancy isolation is enforced at the database layer via PostgreSQL Row Level Security (RLS) using `auth.jwt() ->> 'school_id'` and session tokens.
- No direct client mutation is permitted on audit or ledger tables; state transitions must route through secure RPC procedures (`SECURITY DEFINER` with explicit `search_path`).
- Migrations must be strictly idempotent or forward-compatible and applied in timestamp order.

## Side Effects
- Mutates PostgreSQL database schemas, constraints, foreign keys, triggers, and table data.
- Emits outbox audit log entries into `audit_logs` and operational event streams.

## Verification
- Run: `bash tooling/test-db-local.sh`
