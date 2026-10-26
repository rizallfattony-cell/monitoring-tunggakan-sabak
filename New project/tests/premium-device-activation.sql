set time zone 'Asia/Jakarta';
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005');
insert into public.monitoring_profiles(user_id,email,petugas,role,premium_package,premium_active_from,premium_active_until) values
 ('00000000-0000-0000-0000-000000000001','14390.adri@simontok.local','ADRI','petugas','SIMONTOK_PREMIUM',current_date-2,current_date+28),
 ('00000000-0000-0000-0000-000000000002','expired@test.invalid','EXPIRED','petugas','SIMONTOK_PREMIUM',current_date-30,current_date-1),
 ('00000000-0000-0000-0000-000000000003','admin@test.invalid','ADMIN','admin','FREE',null,null),
 ('00000000-0000-0000-0000-000000000004','future@test.invalid','FUTURE','petugas','BILLMAN_PRO',current_date+1,current_date+30),
 ('00000000-0000-0000-0000-000000000005','free@test.invalid','FREE','petugas','FREE',null,null);
insert into public.monitoring_premium_payments(user_id,billing_month,package_code,amount,paid_at)
values('00000000-0000-0000-0000-000000000001',date_trunc('month',current_date)::date,'SIMONTOK_PREMIUM',50000,current_date);
grant usage on schema auth to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ declare first_result jsonb; second_result jsonb; begin
 first_result:=public.get_my_premium_access('ADRI_DEVICE');
 assert (first_result->>'device_bound')::boolean,'unbound active ADRI binds successfully';
 assert first_result->>'premium_device_id'='ADRI_DEVICE','actual device returned';
 assert public.get_my_premium_access('ADRI_DEVICE')=first_result,'same device idempotent';
 second_result:=public.get_my_premium_access('OTHER_DEVICE');
 assert not (second_result->>'device_bound')::boolean,'another device cannot claim active binding';
 assert (second_result->>'bound_to_other_device')::boolean,'other-device reason returned';
 assert second_result->>'premium_device_id'='ADRI_DEVICE','binding is not stolen';
 begin perform public.get_my_premium_access('null');raise exception 'FAIL: placeholder device accepted';
 exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ begin
 assert (select premium_package='SIMONTOK_PREMIUM' and premium_active_until=current_date+28 from public.monitoring_profiles where petugas='ADRI'),'package and active period unchanged';
 assert (select paid_at=current_date and amount=50000 from public.monitoring_premium_payments),'paid confirmation and amount unchanged';
end $$;
update public.monitoring_profiles set premium_device_id='null' where petugas='ADRI';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin assert (public.get_my_premium_access('ADRI_DEVICE')->>'device_bound')::boolean,'legacy literal null repaired on own account';end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin assert not (public.get_my_premium_access('EXPIRED_DEVICE')->>'device_bound')::boolean,'expired does not bind';end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin assert not (public.get_my_premium_access('FUTURE_DEVICE')->>'device_bound')::boolean,'future period does not bind';end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
do $$ begin assert not (public.get_my_premium_access('FREE_DEVICE')->>'device_bound')::boolean,'free does not bind';end $$;
reset role;
do $$ begin
 assert (select count(*) from public.monitoring_profiles where premium_device_id is not null)=1,'other profiles unchanged';
end $$;
set role anon;
do $$ begin
 begin perform public.get_my_premium_access('ANON_DEVICE');raise exception 'FAIL: anon can bind';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: active ADRI binds, null handled, device cannot be stolen, payments unchanged, expired/future/free/anon denied';
