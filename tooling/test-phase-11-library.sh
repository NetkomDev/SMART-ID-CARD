#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to a disposable Supabase/PostgreSQL database with all migrations applied}"
psql "$DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --file=supabase/tests/phase_11_library_integration.sql
