begin;
do $$
declare
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  month_start date := date_trunc('month', today_wib)::date;
  user_one uuid := '00000000-0000-0000-0000-000000000001';
  billman uuid := '00000000-0000-0000-0000-000000000005';
  status jsonb;
begin
  assert not exists (select 1 from public.monitoring_profiles where premium_package in ('P1', 'P2', 'P3')), 'legacy profiles renamed';
  assert (select amount = 50000 and paid_at is null from public.monitoring_premium_payments where user_id = user_one and billing_month = month_start), 'current unpaid tariff updated';
  assert (select amount = 25000 and paid_at = month_start + 19 from public.monitoring_premium_payments where user_id = '00000000-0000-0000-0000-000000000003' and billing_month = month_start), 'settled payment preserved';
  assert (select amount = 15000 from public.monitoring_premium_payments where user_id = user_one and billing_month < month_start), 'historical price preserved';
  status := public._premium_billing_status(user_one, today_wib);
  assert status->>'package_code' = 'SIMONTOK_PREMIUM' and (status->>'amount')::int = 50000, 'SIMONTOK tariff';
  status := public._premium_billing_status(user_one, (month_start + interval '1 month - 1 day')::date - 2);
  assert (status->>'access_blocked')::boolean, 'last three days still lock';

  perform set_config('request.jwt.claim.sub', user_one::text, true);
  status := public.get_my_premium_billing_status();
  assert status->>'package_code' = 'SIMONTOK_PREMIUM', 'owner API uses renamed plan';
  begin
    perform public.admin_set_premium_access(billman, 'BILLMAN_PRO', month_start, month_start + 30, null);
    raise exception 'User cannot assign a package';
  exception when raise_exception then
    if sqlerrm not like 'Hanya admin%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  perform public.admin_set_premium_access(billman, 'BILLMAN_PRO', month_start, month_start + 30, 'test');
  status := public._premium_billing_status(billman, today_wib);
  assert status->>'package_code' = 'BILLMAN_PRO' and (status->>'amount')::int = 50000, 'BILLMAN tariff';
  assert (select count(*) = 3 from public.admin_list_premium_payments(month_start)), 'admin sees all billed users';
  assert (select count(*) = 4 from public.admin_list_premium_users()), 'premium monitoring includes new plans and FREE users';
  assert not has_function_privilege('authenticated', 'public._premium_billing_status(uuid,date)', 'execute'), 'date override remains private';
  if extract(day from today_wib) >= 20 then
    perform public.admin_set_premium_payment(user_one, month_start, today_wib, 'paid');
    status := public._premium_billing_status(user_one, today_wib);
    assert not (status->>'should_remind')::boolean and not (status->>'access_blocked')::boolean, 'paid user unlocked';
  end if;
  assert (select minimum_version = '1.7.3' from public.monitoring_app_releases where id = 'android'), 'release version';
  raise notice 'PASS: new plans, uniform tariff, paid history, idempotency, permissions, gating and admin recap';
end;
$$;
rollback;
