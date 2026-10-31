set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$
declare
  report_month date := (date_trunc('month', timezone('Asia/Jakarta', now())) - interval '1 month')::date;
  first_date date := report_month;
  category_date date := (report_month + interval '2 days')::date;
  middle_date date := (report_month + interval '14 days')::date;
  last_date date := (report_month + interval '27 days')::date;
begin
  perform public.save_debt_performance_daily_snapshot(first_date, 'saldo-01.xlsx', jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','saldo_id',100,'saldo_rupiah',1000000),
    jsonb_build_object('petugas','ADRI','saldo_id',50,'saldo_rupiah',500000)
  ));
  perform public.save_debt_performance_daily_snapshot(middle_date, 'saldo-15.xlsx', jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','saldo_id',60,'saldo_rupiah',600000),
    jsonb_build_object('petugas','ADRI','saldo_id',25,'saldo_rupiah',250000)
  ));
  perform public.save_debt_performance_daily_snapshot(last_date, 'saldo-28.xlsx', jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','saldo_id',30,'saldo_rupiah',300000),
    jsonb_build_object('petugas','ADRI','saldo_id',10,'saldo_rupiah',100000)
  ));

  assert (select count(*) from public.monitoring_debt_performance_daily where snapshot_date between first_date and last_date) = 6,
    'daily rows stored per officer and date';
  assert (select awal_rupiah from public.monitoring_debt_performance_monthly where month=report_month and petugas='ANANG RIDWAN') = 1000000,
    'monthly opening follows earliest daily upload';
  assert (select akhir_rupiah from public.monitoring_debt_performance_monthly where month=report_month and petugas='ANANG RIDWAN') = 300000,
    'monthly closing follows latest daily upload';

  perform public.save_debt_performance_daily_snapshot(last_date, 'saldo-28-revisi.xlsx', jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','saldo_id',20,'saldo_rupiah',200000),
    jsonb_build_object('petugas','ADRI','saldo_id',5,'saldo_rupiah',50000)
  ));
  assert (select count(*) from public.monitoring_debt_performance_daily where snapshot_date=last_date) = 2,
    'same-day upload replaces previous rows';
  assert (select akhir_rupiah from public.monitoring_debt_performance_monthly where month=report_month and petugas='ANANG RIDWAN') = 200000,
    'monthly closing refreshed after replacement';

  begin
    perform public.save_debt_performance_daily_snapshot(first_date, 'duplicate.xlsx', '[{"petugas":"ADRI","saldo_id":1,"saldo_rupiah":1},{"petugas":"adri","saldo_id":1,"saldo_rupiah":1}]'::jsonb);
    raise exception 'FAIL: duplicate officer accepted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_debt_performance_daily_snapshot(category_date, 'kategori.xlsx', '[{"petugas":"<41500-6600","saldo_id":1,"saldo_rupiah":1}]'::jsonb);
  exception when others then
    raise exception 'FAIL: agreed saldo category rejected: %', sqlerrm;
  end;
  assert (select count(*) from public.monitoring_debt_performance_daily where snapshot_date=category_date and petugas='<41500-6600') = 1,
    'agreed saldo category is stored';
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
declare
  report_month date := (date_trunc('month', timezone('Asia/Jakarta', now())) - interval '1 month')::date;
begin
  assert (select count(*) from public.monitoring_debt_performance_daily where snapshot_date >= report_month and petugas='ANANG RIDWAN') = 3,
    'petugas sees own daily rows';
  assert (select count(*) from public.monitoring_debt_performance_daily where snapshot_date >= report_month and petugas='ADRI') = 0,
    'RLS hides another officer daily rows';
  begin
    perform public.save_debt_performance_daily_snapshot(report_month, 'forbidden.xlsx', jsonb_build_array(
      jsonb_build_object('petugas','ANANG RIDWAN','saldo_id',1,'saldo_rupiah',1)
    ));
    raise exception 'FAIL: petugas saved daily snapshot';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.delete_debt_performance_daily_snapshot(report_month);
    raise exception 'FAIL: petugas deleted daily snapshot';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin
    perform public.save_debt_performance_daily_snapshot(current_date, 'anon.xlsx', '[]'::jsonb);
    raise exception 'FAIL: anon executed daily save RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$
declare
  report_month date := (date_trunc('month', timezone('Asia/Jakarta', now())) - interval '1 month')::date;
  last_date date := (report_month + interval '27 days')::date;
begin
  perform public.delete_debt_performance_daily_snapshot(last_date);
  assert (select count(*) from public.monitoring_debt_performance_daily where snapshot_date=last_date) = 0,
    'admin deletes one dashboard date';
  assert (select akhir_rupiah from public.monitoring_debt_performance_monthly where month=report_month and petugas='ANANG RIDWAN') = 600000,
    'monthly closing falls back to previous daily date after delete';
end $$;
reset role;

select 'PASS daily debt performance: replace, monthly refresh, delete and RLS';
