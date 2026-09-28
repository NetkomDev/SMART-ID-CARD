#!/usr/bin/env bash
# Runs migrations and SQL integration checks in an isolated, disposable PostgreSQL cluster.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
sa_tmp="$(mktemp -d "${TMPDIR:-/tmp}/aksis-sa-test.XXXXXX")"
sa_port="${AKSIS_TEST_PG_PORT:-55441}"
cleanup(){ pg_ctl -D "$sa_tmp/data" -m immediate stop > /dev/null 2>&1 || true; rm -rf "$sa_tmp"; }
trap cleanup EXIT
initdb -D "$sa_tmp/data" -A trust -U postgres --no-locale -E UTF8 > "$sa_tmp/init.log"
pg_ctl -D "$sa_tmp/data" -l "$sa_tmp/server.log" -o "-p $sa_port -k $sa_tmp -h 127.0.0.1" start > /dev/null
export PGHOST="$sa_tmp" PGPORT="$sa_port" PGUSER=postgres PGDATABASE=postgres
psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql > "$sa_tmp/migrations.log"
for migration in supabase/migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -f "$migration" >> "$sa_tmp/migrations.log"; done
for test_file in supabase/tests/super_admin_production.sql supabase/tests/portal_qr_integration.sql supabase/tests/phase_11_library_integration.sql; do
 echo "Testing $test_file"
 psql -X -q -v ON_ERROR_STOP=1 -f "$test_file" > "$sa_tmp/test.log"
done
echo 'PASS: all migrations and Super Admin, portal QR, library SQL integration tests.'
