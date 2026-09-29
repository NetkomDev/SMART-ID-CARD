#!/usr/bin/env bash
# Isolated PostgreSQL audit: never connects to the configured Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."
waste_tmp="$(mktemp -d "${TMPDIR:-/tmp}/aksis-waste-audit.XXXXXX")"
cleanup(){ pg_ctl -D "$waste_tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$waste_tmp"; }
trap cleanup EXIT
initdb -D "$waste_tmp/data" -A trust -U postgres --no-locale -E UTF8 > "$waste_tmp/init.log"
pg_ctl -D "$waste_tmp/data" -l "$waste_tmp/server.log" -o "-p 55443 -k $waste_tmp -h 127.0.0.1" start >/dev/null
export PGHOST="$waste_tmp" PGPORT=55443 PGUSER=postgres PGDATABASE=postgres
psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql > "$waste_tmp/migrations.log"
for migration in supabase/migrations/*.sql; do
  psql -X -q -v ON_ERROR_STOP=1 -f "$migration" >> "$waste_tmp/migrations.log"
done
psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/waste_dashboard_integration.sql
echo 'PASS: waste dashboard SQL audit on disposable PostgreSQL.'
