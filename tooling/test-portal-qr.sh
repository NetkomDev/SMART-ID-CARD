#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to a disposable database with migrations applied}"
psql "$DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --file=supabase/tests/portal_qr_integration.sql
