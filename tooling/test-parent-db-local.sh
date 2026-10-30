#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname "$0")/test-db-local.sh" supabase/tests/parent_dashboard_integration.sql
