insert into auth.users (id) values
 ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'), ('00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-000000000005');
insert into public.monitoring_profiles (user_id, email, role, premium_package) values
 ('00000000-0000-0000-0000-000000000001', 'one@test.invalid', 'petugas', 'P1'),
 ('00000000-0000-0000-0000-000000000002', 'admin@test.invalid', 'admin', 'P3'),
 ('00000000-0000-0000-0000-000000000003', 'paid@test.invalid', 'petugas', 'P2'),
 ('00000000-0000-0000-0000-000000000004', 'free@test.invalid', 'petugas', 'FREE'),
 ('00000000-0000-0000-0000-000000000005', 'billman@test.invalid', 'petugas', 'P3');
insert into public.monitoring_premium_payments (user_id, billing_month, package_code, amount, paid_at)
values
 ('00000000-0000-0000-0000-000000000001', date_trunc('month', statement_timestamp() at time zone 'Asia/Jakarta')::date, 'P1', 15000, null),
 ('00000000-0000-0000-0000-000000000003', date_trunc('month', statement_timestamp() at time zone 'Asia/Jakarta')::date, 'P2', 25000, date_trunc('month', statement_timestamp() at time zone 'Asia/Jakarta')::date + 19),
 ('00000000-0000-0000-0000-000000000001', (date_trunc('month', statement_timestamp() at time zone 'Asia/Jakarta') - interval '1 month')::date, 'P1', 15000, (date_trunc('month', statement_timestamp() at time zone 'Asia/Jakarta') - interval '1 month')::date + 19);
