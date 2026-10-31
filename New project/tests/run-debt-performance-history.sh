#!/bin/sh
set -eu
data=/tmp/simontok-debt-performance-test
initdb -D "$data" --no-locale -E UTF8 -U postgres --auth=trust >/tmp/initdb-debt-performance.log
trap 'pg_ctl -D "$data" -m immediate stop >/dev/null 2>&1 || true' EXIT
pg_ctl -D "$data" -l /tmp/postgres-debt-performance.log -o "-c listen_addresses='' -c unix_socket_directories=/tmp" -w start
psql -h /tmp -U postgres -v ON_ERROR_STOP=1 \
 -f /project/tests/premium-billing-fixture.sql \
 -f /project/supabase-schema-step-23-debt-performance-history.sql \
 -f /project/supabase-schema-step-23-debt-performance-history.sql \
 -f /project/tests/debt-performance-history.sql
