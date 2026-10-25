insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.monitoring_profiles(user_id,email,petugas,role,premium_package) values
 ('00000000-0000-0000-0000-000000000001','14390.anang@simontok.local','ANANG RIDWAN','petugas','P3'),
 ('00000000-0000-0000-0000-000000000002','14390.adri@simontok.local','ADRI','petugas','P3'),
 ('00000000-0000-0000-0000-000000000003','admin@simontok.local','ADMIN','admin','P3');
grant usage on schema auth to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
declare snapshot jsonb; result jsonb;
begin
 snapshot:=jsonb_build_object('id','10000000-0000-0000-0000-000000000001','format_version',1,
 'printed_at','2020-09-30T17:00:00Z','sent_at','2020-09-30T17:01:00Z','transaction_id','0012345678',
 'reference','ORIGINAL-REFERENCE','idpel','00143900001','customer_name','Nama <script>',
 'base_amount',100000,'extra_amount',5000,'admin_amount',5000,'total_amount',110000,'print_text',E'ORIGINAL\nJAM 00:00:00\nREF SAME');
 perform public.save_receipt_history(snapshot);
 perform public.save_receipt_history(snapshot);
 assert (select count(*) from public.monitoring_receipt_history)=1,'idempotent original';
 begin
  perform public.save_receipt_history(snapshot||'{"extra_amount":6000,"total_amount":111000}'::jsonb);
  raise exception 'FAIL: snapshot changed';
 exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 snapshot:=snapshot||'{"id":"10000000-0000-0000-0000-000000000002","extra_amount":0,"total_amount":105000,"idpel":"00143900002"}'::jsonb;
 perform public.save_receipt_history(snapshot);
 perform public.record_receipt_reprint('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2020-11-01T00:00:00Z');
 perform public.record_receipt_reprint('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2020-11-01T00:00:00Z');
 result:=public.list_receipt_history('2020-10-01','',0,1);
 assert (result->>'total')::int=2 and jsonb_array_length(result->'rows')=1,'pagination';
 assert (public.list_receipt_history('2020-09-01')->>'total')::int=0,'WIB month boundary';
 assert (public.list_receipt_history('2020-10-01','ORIGINAL')->>'total')::int=2,'search';
 assert public.get_receipt_snapshot('10000000-0000-0000-0000-000000000001')->>'print_text'=E'ORIGINAL\nJAM 00:00:00\nREF SAME','exact text';
 assert (public.get_receipt_snapshot('10000000-0000-0000-0000-000000000001')->>'reprint_count')::int=1,'idempotent reprint';
 begin perform public.admin_receipt_monthly_summary('2020-10-01'); raise exception 'FAIL: non admin summary';
 exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 begin update public.monitoring_receipt_history set extra_amount=0; raise exception 'FAIL: mutable history';
 exception when insufficient_privilege then null; end;
end;
$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 assert (select count(*) from public.monitoring_receipt_history)=0,'RLS hides other owner';
 assert (public.list_receipt_history('2020-10-01')->>'total')::int=0,'RPC hides other owner';
 begin perform public.get_receipt_snapshot('10000000-0000-0000-0000-000000000001'); raise exception 'FAIL: other snapshot';
 exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 begin perform public.record_receipt_reprint('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',now()); raise exception 'FAIL: other reprint';
 exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ declare summary jsonb; row jsonb; begin
 summary:=public.admin_receipt_monthly_summary('2020-10-01');
 assert jsonb_array_length(summary)=17,'17 staff including zeros';
 select value into row from jsonb_array_elements(summary) where value->>'petugas'='ANANG RIDWAN';
 assert (row->>'extra_income')::int=5000,'income excludes bank admin and reprints';
 assert (row->>'transaction_count')::int=2 and (row->>'reprint_count')::int=1,'original month reprint grouping';
 assert (public.list_receipt_history('2020-10-01')->>'total')::int=2,'admin sees all';
 assert (public.list_receipt_history('2020-10-01','',0,50,null,'ADRI')->>'total')::int=0,'staff filter';
end $$;
reset role;
select 'PASS receipt history: immutability, ownership, RLS, idempotency, WIB, pagination, 17 staff and income';
