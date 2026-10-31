insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.monitoring_profiles(user_id,email,petugas,role,premium_package) values
 ('00000000-0000-0000-0000-000000000001','14390.anang@simontok.local','ANANG RIDWAN','petugas','P3'),
 ('00000000-0000-0000-0000-000000000002','14390.adri@simontok.local','ADRI','petugas','P3'),
 ('00000000-0000-0000-0000-000000000003','admin@simontok.local','ADMIN','admin','P3');
grant usage on schema auth to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$
declare
  current_month date := date_trunc('month', timezone('Asia/Jakarta', now()))::date;
  previous_month date := (current_month - interval '1 month')::date;
  older_month date := (current_month - interval '2 months')::date;
  result jsonb;
  row jsonb;
begin
  perform public.save_debt_performance_snapshot(older_month, jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','awal_id',100,'awal_rupiah',1000000,'akhir_id',80,'akhir_rupiah',800000),
    jsonb_build_object('petugas','ADRI','awal_id',50,'awal_rupiah',500000,'akhir_id',40,'akhir_rupiah',400000)
  ));
  perform public.save_debt_performance_snapshot(previous_month, jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','awal_id',100,'awal_rupiah',1000000,'akhir_id',60,'akhir_rupiah',600000),
    jsonb_build_object('petugas','ADRI','awal_id',50,'awal_rupiah',500000,'akhir_id',25,'akhir_rupiah',250000)
  ));
  perform public.save_debt_performance_snapshot(current_month, jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','awal_id',100,'awal_rupiah',1000000,'akhir_id',30,'akhir_rupiah',300000),
    jsonb_build_object('petugas','ADRI','awal_id',50,'awal_rupiah',500000,'akhir_id',10,'akhir_rupiah',100000)
  ));

  result := public.get_debt_performance_history(current_month, 3, null);
  assert result->>'scope' = 'ALL' and jsonb_array_length(result->'rows') = 3, 'overall three-month series';
  select value into row from jsonb_array_elements(result->'rows') order by value->>'month' desc limit 1;
  assert (row->>'officer_count')::int = 2, 'overall officer count';
  assert (row->>'awal_rupiah')::bigint = 1500000 and (row->>'akhir_rupiah')::bigint = 400000, 'overall sums';
  assert (row->>'pelunasan_rupiah')::bigint = 1100000, 'overall paid amount';
  assert round((row->>'persen_tagihan')::numeric, 2) = 73.33, 'overall weighted performance';

  result := public.get_debt_performance_history(current_month, 4, 'ANANG RIDWAN');
  assert jsonb_array_length(result->'rows') = 4, 'four-month series includes missing month';
  assert (select count(*) from jsonb_array_elements(result->'rows') item where (item->>'available')::boolean) = 3, 'missing month is not zero';
  assert result->>'scope' = 'ANANG RIDWAN', 'officer scope';

  perform public.save_debt_performance_snapshot(current_month, jsonb_build_array(
    jsonb_build_object('petugas','ANANG RIDWAN','awal_id',100,'awal_rupiah',1000000,'akhir_id',20,'akhir_rupiah',200000)
  ));
  assert (select count(*) from public.monitoring_debt_performance_monthly where month=current_month) = 1, 'monthly snapshot replaces stale officers';
  assert (select akhir_rupiah from public.monitoring_debt_performance_monthly where month=current_month and petugas='ANANG RIDWAN') = 200000, 'monthly snapshot updates';

  begin
    perform public.save_debt_performance_snapshot(current_month, '[{"petugas":"ANANG RIDWAN","awal_id":1,"awal_rupiah":1,"akhir_id":1,"akhir_rupiah":1},{"petugas":"anang ridwan","awal_id":1,"awal_rupiah":1,"akhir_id":1,"akhir_rupiah":1}]'::jsonb);
    raise exception 'FAIL: duplicate officer accepted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
declare
  current_month date := date_trunc('month', timezone('Asia/Jakarta', now()))::date;
  result jsonb;
begin
  result := public.get_debt_performance_history(current_month, 3, 'ADRI');
  assert result->>'scope' = 'ANANG RIDWAN', 'petugas cannot request another officer';
  assert (select count(*) from public.monitoring_debt_performance_monthly where petugas='ADRI') = 0, 'RLS hides another officer';
  begin
    perform public.save_debt_performance_snapshot(current_month, jsonb_build_array(
      jsonb_build_object('petugas','ANANG RIDWAN','awal_id',1,'awal_rupiah',1,'akhir_id',0,'akhir_rupiah',0)
    ));
    raise exception 'FAIL: petugas saved snapshot';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin
    perform public.get_debt_performance_history(date_trunc('month', now())::date, 3, null);
    raise exception 'FAIL: anon executed history RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'PASS debt performance: monthly upsert, weighted aggregate, ranges, gaps, RLS and role scope';
