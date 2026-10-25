-- Hanya untuk PostgreSQL lokal sementara, bukan database produksi.
-- Run migrations 18 and 19 against the minimal fixture before this file.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');
insert into public.monitoring_profiles (user_id, email, role, premium_package) values
  ('00000000-0000-0000-0000-000000000001', 'biller1@test.invalid', 'petugas', 'P3'),
  ('00000000-0000-0000-0000-000000000002', 'admin@test.invalid', 'admin', 'P3'),
  ('00000000-0000-0000-0000-000000000003', 'free@test.invalid', 'petugas', 'FREE'),
  ('00000000-0000-0000-0000-000000000004', 'biller2@test.invalid', 'petugas', 'P1');

do $$
declare
  user_one uuid := '00000000-0000-0000-0000-000000000001';
  user_two uuid := '00000000-0000-0000-0000-000000000004';
  status jsonb;
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  current_month date := date_trunc('month', today_wib)::date;
begin
  assert (select minimum_version = '1.7.2' and force_update from public.monitoring_app_releases where id = 'android'), 'release activation follows successful migration';
  status := public._premium_billing_status(user_one, date '2026-10-19');
  assert not (status->>'should_remind')::boolean and not (status->>'access_blocked')::boolean, '19 Oct: no reminder';
  status := public._premium_billing_status(user_one, date '2026-10-20');
  assert (status->>'should_remind')::boolean and not (status->>'access_blocked')::boolean, '20 Oct: dismissible reminder';
  assert (status->>'amount')::bigint = 50000, 'P3 amount';
  status := public._premium_billing_status(user_one, date '2026-10-28');
  assert not (status->>'access_blocked')::boolean, '28 Oct: still usable';
  for test_day in 29..31 loop
    status := public._premium_billing_status(user_one, make_date(2026, 10, test_day));
    assert (status->>'access_blocked')::boolean, '29-31 Oct: blocked';
  end loop;
  assert (select count(*) = 1 from public.monitoring_premium_payments where user_id = user_one), 'no duplicate bills';
  status := public._premium_billing_status(user_one, date '2026-11-01');
  assert (status->>'access_blocked')::boolean and status->>'billing_month' = '2026-10-01', 'unpaid balance persists next month';

  update public.monitoring_premium_payments set paid_at = date '2026-10-29' where user_id = user_one and billing_month = date '2026-10-01';
  status := public._premium_billing_status(user_one, date '2026-10-29');
  assert not (status->>'should_remind')::boolean and not (status->>'access_blocked')::boolean, 'paid bill unlocks';
  update public.monitoring_premium_payments set paid_at = null where user_id = user_one and billing_month = date '2026-10-01';
  status := public._premium_billing_status(user_one, date '2026-10-29');
  assert (status->>'access_blocked')::boolean, 'cancelled payment restores lock';
  update public.monitoring_premium_payments set paid_at = date '2026-10-29' where user_id = user_one and billing_month = date '2026-10-01';
  status := public._premium_billing_status(user_one, date '2026-11-19');
  assert not (status->>'should_remind')::boolean and not (status->>'access_blocked')::boolean, 'paid old month does not affect next month';
  status := public._premium_billing_status(user_one, date '2026-11-20');
  assert (status->>'should_remind')::boolean and not (status->>'access_blocked')::boolean, 'new monthly reminder';
  status := public._premium_billing_status(user_one, date '2026-11-27');
  assert not (status->>'access_blocked')::boolean, '27 Nov: still usable';
  status := public._premium_billing_status(user_one, date '2026-11-28');
  assert (status->>'access_blocked')::boolean, '28 Nov: last three days begin';

  delete from public.monitoring_premium_payments where user_id = user_one;
  status := public._premium_billing_status(user_one, date '2027-02-25');
  assert not (status->>'access_blocked')::boolean, '25 Feb: still usable';
  status := public._premium_billing_status(user_one, date '2027-02-26');
  assert (status->>'access_blocked')::boolean and status->>'lock_start' = '2027-02-26', 'February last three days';
  delete from public.monitoring_premium_payments where user_id = user_one;
  status := public._premium_billing_status(user_one, date '2028-02-27');
  assert (status->>'access_blocked')::boolean and status->>'lock_start' = '2028-02-27', 'leap year last three days';

  status := public._premium_billing_status('00000000-0000-0000-0000-000000000002', date '2026-10-31');
  assert not (status->>'enrolled')::boolean and not (status->>'access_blocked')::boolean, 'admin exempt';
  status := public._premium_billing_status('00000000-0000-0000-0000-000000000003', date '2026-10-31');
  assert not (status->>'enrolled')::boolean and not (status->>'access_blocked')::boolean, 'FREE user not invoiced';
  status := public._premium_billing_status(user_two, today_wib);
  assert (status->>'amount')::bigint = 15000, 'P1 uses own price';
  update public.monitoring_profiles set premium_package = 'P3' where user_id = user_two;
  status := public._premium_billing_status(user_two, today_wib);
  assert status->>'package_code' = 'P1' and (status->>'amount')::bigint = 15000, 'existing snapshot retained after package change';

  assert not has_function_privilege('anon', 'public.get_my_premium_billing_status()', 'execute'), 'anonymous denied';
  assert not has_function_privilege('authenticated', 'public._premium_billing_status(uuid,date)', 'execute'), 'date and user-id override denied';
  assert not has_table_privilege('authenticated', 'public.monitoring_premium_payments', 'update'), 'petugas cannot mark self paid';
  perform set_config('request.jwt.claim.sub', user_two::text, true);
  status := public.get_my_premium_billing_status();
  assert status->>'package_code' = 'P1' and (status->>'amount')::bigint = 15000, 'public RPC reads caller only';
  assert status->>'server_date' = today_wib::text, 'WIB date from server';
  assert status->>'server_now' is not null, 'server timestamp included';
  assert (status->>'server_now_ms')::bigint > 0, 'numeric server timestamp for Android';
  assert (status->>'next_check_at_ms')::bigint > (status->>'server_now_ms')::bigint, 'numeric lease expires in future';
  assert (status->>'next_check_at')::timestamptz = ((today_wib + 1)::timestamp at time zone 'Asia/Jakarta'), 'cache expires at WIB midnight';

  begin
    perform public.admin_list_premium_payments(current_month);
    raise exception 'Petugas must not read other users bills';
  exception when raise_exception then
    if sqlerrm not like 'Hanya admin%' then raise; end if;
  end;
  begin
    perform public.admin_set_premium_payment(user_two, current_month, today_wib, 'test');
    raise exception 'Petugas must not be allowed to mark paid';
  exception when raise_exception then
    if sqlerrm not like 'Hanya admin%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  assert (select count(*) = 2 from public.admin_list_premium_payments(current_month)), 'admin recap works after migration';
  perform public._premium_billing_status(user_two, (current_month - interval '1 month')::date);
  perform public.admin_set_premium_payment(user_two, (current_month - interval '1 month')::date, today_wib, 'late payment');
  assert (select paid_at = today_wib from public.monitoring_premium_payments where user_id = user_two and billing_month = (current_month - interval '1 month')::date), 'late payment keeps actual date';
  begin
    perform public.admin_set_premium_payment(user_two, current_month, today_wib + 1, 'future');
    raise exception 'Future paid date must be rejected';
  exception when raise_exception then
    if sqlerrm not like 'Tanggal pembayaran%' then raise; end if;
  end;
  raise notice 'PASS: reminders, month boundaries, leap year, unlock, snapshots, auth and late payment';
end;
$$;

rollback;
