#!/bin/sh
set -eu
data=/tmp/simontok-packages-test
initdb -D "$data" --no-locale -E UTF8 -U postgres --auth=trust >/tmp/initdb.log
trap 'pg_ctl -D "$data" -m immediate stop >/dev/null 2>&1 || true' EXIT
pg_ctl -D "$data" -l /tmp/postgres.log -o "-c listen_addresses='' -c unix_socket_directories=/tmp" -w start
psql -h /tmp -U postgres -v ON_ERROR_STOP=1 \
 -f /project/tests/premium-billing-fixture.sql \
 -f /project/supabase-schema-step-17-admin-premium.sql \
 -f /project/supabase-schema-step-18-premium-payments.sql \
 -f /project/tests/premium-packages-seed.sql \
 -f /project/supabase-release-1.7.3.sql \
 -f /project/supabase-release-1.7.3.sql \
 -f /project/tests/premium-packages.sql
if psql -h /tmp -U postgres -v ON_ERROR_STOP=1 -f /project/supabase-release-1.7.2.sql; then
  echo 'FAIL: script lama tidak boleh menurunkan skema paket baru'
  exit 1
else
  echo 'PASS: script lama diblokir setelah migrasi paket baru'
fi
