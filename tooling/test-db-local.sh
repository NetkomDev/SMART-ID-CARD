#!/usr/bin/env bash
# Disposable PostgreSQL only. Never reads DATABASE_URL or application .env files.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${AKSIS_PG_BIN:-}" ]]; then export PATH="$AKSIS_PG_BIN:$PATH"; fi
pg_major="$(pg_config --version | sed -E 's/.* ([0-9]+).*/\1/')"
if (( pg_major < 15 )); then
  echo 'PostgreSQL >=15 required (security_invoker). Set AKSIS_PG_BIN to supported binaries.' >&2
  exit 2
fi
audit_tmp="$(mktemp -d "${TMPDIR:-/tmp}/aksis-db-audit.XXXXXX")"
audit_logs="${AKSIS_DB_LOG_DIR:-$audit_tmp/evidence}"
mkdir -p "$audit_logs"
cleanup(){ pg_ctl -D "$audit_tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$audit_tmp"; }
trap cleanup EXIT
initdb -D "$audit_tmp/data" -A trust -U postgres --no-locale -E UTF8 > "$audit_logs/init.log"
pg_ctl -D "$audit_tmp/data" -l "$audit_logs/server.log" -o "-k $audit_tmp -h ''" start >/dev/null
unset DATABASE_URL PGSERVICE PGSERVICEFILE
export PGHOST="$audit_tmp" PGPORT=5432 PGUSER=postgres PGDATABASE=postgres
psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql > "$audit_logs/migrations.log" 2>&1
for migration in supabase/migrations/*.sql; do
  if [[ "$migration" == *202610300001* && -n "${AKSIS_UPGRADE_FIXTURE:-}" ]]; then
    psql -X -q -v ON_ERROR_STOP=1 -f "$AKSIS_UPGRADE_FIXTURE" >> "$audit_logs/migrations.log" 2>&1
  fi
  echo "MIGRATE $migration"
  if ! psql -X -q -v ON_ERROR_STOP=1 -f "$migration" >> "$audit_logs/migrations.log" 2>&1; then
    tail -n 20 "$audit_logs/migrations.log" >&2; exit 1
  fi
done
if [[ $# -eq 0 ]]; then set -- supabase/tests/*integration.sql supabase/tests/super_admin_production.sql; fi
for suite in "$@"; do
  echo "TEST $suite"
  suite_log="$audit_logs/$(basename "$suite").log"
  if ! psql -X -q -v ON_ERROR_STOP=1 -f "$suite" > "$suite_log" 2>&1; then
    tail -n 30 "$suite_log" >&2; exit 1
  fi
  tail -n 2 "$suite_log"
done
if [[ "${AKSIS_RESTORE_DRILL:-0}" == 1 ]]; then
  pg_dump --no-owner postgres > "$audit_tmp/restore.sql"
  createdb restored
  psql -X -q -v ON_ERROR_STOP=1 -d restored -f "$audit_tmp/restore.sql" > "$audit_logs/restore.log" 2>&1
  baseline="$(psql -X -At -c 'select json_build_array((select count(*) from public.students),(select count(*) from public.parent_student_links))')"
  restored="$(psql -X -At -d restored -c 'select json_build_array((select count(*) from public.students),(select count(*) from public.parent_student_links))')"
  [[ "$baseline" == "$restored" ]] || { echo 'Restore counts differ' >&2; exit 1; }
  echo "PASS: local dump/restore counts $restored" | tee -a "$audit_logs/restore.log"
fi
echo "PASS: disposable PostgreSQL $pg_major; all selected suites passed."
