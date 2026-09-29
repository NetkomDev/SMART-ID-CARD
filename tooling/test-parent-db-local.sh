#!/usr/bin/env bash
# Isolated PostgreSQL audit: never connects to the configured Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."
parent_tmp="$(mktemp -d "${TMPDIR:-/tmp}/aksis-parent-audit.XXXXXX")"
cleanup(){ pg_ctl -D "$parent_tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$parent_tmp"; }
trap cleanup EXIT
initdb -D "$parent_tmp/data" -A trust -U postgres --no-locale -E UTF8 > "$parent_tmp/init.log"
pg_ctl -D "$parent_tmp/data" -l "$parent_tmp/server.log" -o "-p 55444 -k $parent_tmp -h 127.0.0.1" start >/dev/null
export PGHOST="$parent_tmp" PGPORT=55444 PGUSER=postgres PGDATABASE=postgres
psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql > "$parent_tmp/migrations.log"
for migration in supabase/migrations/*.sql; do
  psql -X -q -v ON_ERROR_STOP=1 -f "$migration" >> "$parent_tmp/migrations.log"
done
psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/parent_dashboard_integration.sql
echo 'PASS: parent dashboard SQL audit on disposable PostgreSQL.'
