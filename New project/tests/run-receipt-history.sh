#!/bin/sh
set -eu
data=/tmp/simontok-receipt-test
initdb -D "$data" --no-locale -E UTF8 -U postgres --auth=trust >/tmp/initdb.log
trap 'pg_ctl -D "$data" -m immediate stop >/dev/null 2>&1 || true' EXIT
pg_ctl -D "$data" -l /tmp/postgres.log -o "-c listen_addresses='' -c unix_socket_directories=/tmp" -w start
psql -h /tmp -U postgres -v ON_ERROR_STOP=1 \
 -f /project/tests/premium-billing-fixture.sql \
 -f /project/supabase-schema-step-21-receipt-history.sql \
 -f /project/supabase-schema-step-21-receipt-history.sql \
 -f /project/tests/receipt-history.sql \
 -f /project/supabase-schema-step-17-admin-premium.sql \
 -f /project/supabase-schema-step-18-premium-payments.sql \
 -f /project/supabase-schema-step-19-premium-billing-gate.sql \
 -f /project/supabase-schema-step-20-premium-packages.sql \
 -f /project/supabase-prepare-1.7.4.sql \
 -f /project/supabase-release-1.7.4.sql \
 -f /project/supabase-release-1.7.4.sql
if psql -h /tmp -U postgres -v ON_ERROR_STOP=1 -f /project/supabase-release-1.7.3.sql; then
 echo 'FAIL: older release must not downgrade 1.7.4'
 exit 1
else
 echo 'PASS: release 1.7.4 idempotent; downgrade blocked'
fi
