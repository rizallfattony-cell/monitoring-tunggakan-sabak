set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);

do $$
declare
  report_month date := (date_trunc('month', timezone('Asia/Jakarta', now())) - interval '1 month')::date;
  first_date date := report_month;
  latest_date date := (report_month + interval '9 days')::date;
begin
  perform public.save_kogol_debt_snapshot(first_date, 'kogol-awal.xlsx', jsonb_build_array(
    jsonb_build_object('kogol_key','KOGOL_3_PERKANTORAN','saldo_id',100,'saldo_rupiah',1000000),
    jsonb_build_object('kogol_key','KOGOL_3_LPJU','saldo_id',20,'saldo_rupiah',200000)
  ));
  perform public.save_kogol_debt_snapshot(latest_date, 'kogol-terbaru.xlsx', jsonb_build_array(
    jsonb_build_object('kogol_key','KOGOL_3_PERKANTORAN','saldo_id',40,'saldo_rupiah',400000),
    jsonb_build_object('kogol_key','KOGOL_4','saldo_id',5,'saldo_rupiah',50000)
  ));

  assert (select count(*) from public.monitoring_kogol_debt_snapshots where snapshot_date = first_date) = 2,
    'first Kogol snapshot stores both Kogol 3 groups';
  assert (select saldo_id from public.monitoring_kogol_debt_snapshots where snapshot_date = latest_date and kogol_key='KOGOL_3_PERKANTORAN') = 40,
    'latest snapshot stores current balance';

  perform public.save_kogol_debt_snapshot(latest_date, 'kogol-revisi.xlsx', jsonb_build_array(
    jsonb_build_object('kogol_key','KOGOL_3_PERKANTORAN','saldo_id',35,'saldo_rupiah',350000)
  ));
  assert (select saldo_id from public.monitoring_kogol_debt_snapshots where snapshot_date = latest_date and kogol_key='KOGOL_3_PERKANTORAN') = 35,
    'same Kogol/date replaces only the submitted group';
  assert (select saldo_id from public.monitoring_kogol_debt_snapshots where snapshot_date = latest_date and kogol_key='KOGOL_4') = 5,
    'same-date revision keeps other Kogol groups';

  begin
    perform public.save_kogol_debt_snapshot(first_date, 'invalid.xlsx', '[{"kogol_key":"LAIN","saldo_id":1,"saldo_rupiah":1}]'::jsonb);
    raise exception 'FAIL: unknown Kogol group accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
declare
  report_month date := (date_trunc('month', timezone('Asia/Jakarta', now())) - interval '1 month')::date;
begin
  assert (select count(*) from public.monitoring_kogol_debt_snapshots where snapshot_date >= report_month) = 0,
    'petugas cannot read Kogol dashboard snapshots';
  begin
    perform public.save_kogol_debt_snapshot(report_month, 'forbidden.xlsx', jsonb_build_array(
      jsonb_build_object('kogol_key','KOGOL_0','saldo_id',1,'saldo_rupiah',1)
    ));
    raise exception 'FAIL: petugas saved Kogol snapshot';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;
reset role;

set role anon;
do $$ begin
  begin
    perform public.save_kogol_debt_snapshot(current_date, 'anon.xlsx', '[]'::jsonb);
    raise exception 'FAIL: anon executed Kogol save RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'PASS Kogol dashboard: snapshot upsert, group scope and RLS';
