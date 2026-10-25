-- Paket baru, tarif seragam. Jalankan setelah step 17-19.
begin;

-- Hanya ganti check satu kolom paket; jangan menghapus aturan profil lain.
do $$
declare rule record;
begin
  for rule in
    select conname from pg_constraint
    where conrelid = 'public.monitoring_profiles'::regclass and contype = 'c'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.monitoring_profiles'::regclass and attname = 'premium_package')]::smallint[]
  loop
    execute format('alter table public.monitoring_profiles drop constraint %I', rule.conname);
  end loop;
end;
$$;

update public.monitoring_profiles set premium_package = 'SIMONTOK_PREMIUM'
where premium_package in ('P1', 'P2', 'P3');
alter table public.monitoring_profiles add constraint monitoring_profiles_premium_package_check
  check (premium_package in ('FREE', 'SIMONTOK_PREMIUM', 'BILLMAN_PRO'));

alter table public.monitoring_premium_payments drop constraint if exists monitoring_premium_payments_package_code_check;
alter table public.monitoring_premium_payments add constraint monitoring_premium_payments_package_code_check
  check (package_code in ('P1', 'P2', 'P3', 'SIMONTOK_PREMIUM', 'BILLMAN_PRO'));

-- Riwayat yang sudah dibayar tidak ditagihkan ulang atau diganti nominalnya.
update public.monitoring_premium_payments
set package_code = case when package_code in ('P1', 'P2', 'P3') then 'SIMONTOK_PREMIUM' else package_code end,
    amount = case when paid_at is null then 50000 else amount end,
    updated_at = now()
where billing_month >= date_trunc('month', statement_timestamp() at time zone 'Asia/Jakarta')::date;

create or replace function public._premium_billing_status(p_user_id uuid, p_today date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  profile public.monitoring_profiles%rowtype;
  payment public.monitoring_premium_payments%rowtype;
  month_start date := date_trunc('month', p_today)::date;
  due_start date;
  due_end date;
  lock_start date;
  remind boolean := false;
  blocked boolean := false;
begin
  select * into profile from public.monitoring_profiles where user_id = p_user_id;
  if not found then raise exception 'Profil pengguna tidak ditemukan'; end if;
  if p_today is null then raise exception 'Tanggal server tidak tersedia'; end if;
  if profile.role = 'admin' or coalesce(profile.premium_package, 'FREE') not in ('SIMONTOK_PREMIUM', 'BILLMAN_PRO') then
    return jsonb_build_object('enrolled', false, 'should_remind', false, 'access_blocked', false,
      'reason', 'exempt', 'server_date', p_today,
      'next_check_at', ((p_today + 1)::timestamp at time zone 'Asia/Jakarta'),
      'next_check_at_ms', (extract(epoch from ((p_today + 1)::timestamp at time zone 'Asia/Jakarta')) * 1000)::bigint);
  end if;
  insert into public.monitoring_premium_payments (user_id, billing_month, package_code, amount)
  values (p_user_id, month_start, profile.premium_package, 50000)
  on conflict on constraint monitoring_premium_payments_user_month_key do nothing;

  select * into payment from public.monitoring_premium_payments
  where user_id = p_user_id and paid_at is null and amount > 0 and billing_month + 19 <= p_today
  order by billing_month limit 1;
  if not found then
    select * into payment from public.monitoring_premium_payments where user_id = p_user_id and billing_month = month_start;
  end if;
  due_start := payment.billing_month + 19;
  due_end := (payment.billing_month + interval '1 month - 1 day')::date;
  lock_start := due_end - 2;
  remind := payment.paid_at is null and payment.amount > 0 and p_today >= due_start;
  blocked := remind and p_today >= lock_start;
  return jsonb_build_object('enrolled', true, 'billing_month', payment.billing_month,
    'package_code', payment.package_code, 'amount', payment.amount,
    'due_start', due_start, 'due_end', due_end, 'lock_start', lock_start, 'paid_at', payment.paid_at,
    'should_remind', remind, 'access_blocked', blocked,
    'reason', case when blocked then 'blocked' when remind then 'unpaid' when payment.paid_at is not null then 'paid' else 'before_due' end,
    'server_date', p_today, 'next_check_at', ((p_today + 1)::timestamp at time zone 'Asia/Jakarta'),
    'next_check_at_ms', (extract(epoch from ((p_today + 1)::timestamp at time zone 'Asia/Jakarta')) * 1000)::bigint);
end;
$$;

create or replace function public.admin_list_premium_payments(p_billing_month date)
returns table (user_id uuid, username text, petugas text, package_code text, amount bigint,
  billing_month date, due_start date, due_end date, paid_at date, payment_note text, payment_status text)
language plpgsql security definer set search_path = public as $$
declare
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  month_start date := date_trunc('month', coalesce(p_billing_month, today_wib))::date;
  month_end date := (month_start + interval '1 month - 1 day')::date;
begin
  if not exists (select 1 from public.monitoring_profiles p where p.user_id = auth.uid() and p.role = 'admin') then
    raise exception 'Hanya admin yang dapat melihat rekap pembayaran premium';
  end if;
  insert into public.monitoring_premium_payments (user_id, billing_month, package_code, amount)
  select p.user_id, month_start, p.premium_package, 50000 from public.monitoring_profiles p
  where p.role <> 'admin' and p.premium_package in ('SIMONTOK_PREMIUM', 'BILLMAN_PRO')
    and month_start = date_trunc('month', today_wib)::date
  on conflict on constraint monitoring_premium_payments_user_month_key do nothing;
  return query select payment.user_id, upper(split_part(p.email, '@', 1)),
    coalesce(nullif(p.petugas, ''), upper(split_part(p.email, '@', 1))),
    payment.package_code, payment.amount, payment.billing_month, month_start + 19, month_end,
    payment.paid_at, payment.payment_note,
    case when payment.paid_at is not null then 'paid' when today_wib > month_end then 'overdue' else 'unpaid' end
  from public.monitoring_premium_payments payment join public.monitoring_profiles p on p.user_id = payment.user_id
  where payment.billing_month = month_start
  order by case when payment.paid_at is null then 0 else 1 end, coalesce(nullif(p.petugas, ''), p.email);
end;
$$;

create or replace function public.admin_set_premium_payment(p_user_id uuid, p_billing_month date, p_paid_at date, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  month_start date := date_trunc('month', coalesce(p_billing_month, today_wib))::date;
  package_value text;
  amount_value bigint;
begin
  if not exists (select 1 from public.monitoring_profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Hanya admin yang dapat mengubah pembayaran premium';
  end if;
  if month_start > date_trunc('month', today_wib)::date then raise exception 'Bulan tagihan belum dimulai'; end if;
  if p_paid_at is not null and (p_paid_at < month_start + 19 or p_paid_at > today_wib) then
    raise exception 'Tanggal pembayaran harus sejak tanggal 20 bulan tagihan sampai hari ini (WIB)';
  end if;
  select package_code, amount into package_value, amount_value from public.monitoring_premium_payments
  where user_id = p_user_id and billing_month = month_start;
  if not found then
    if month_start <> date_trunc('month', today_wib)::date then raise exception 'Tagihan bulan tersebut tidak ditemukan'; end if;
    select premium_package, 50000 into package_value, amount_value from public.monitoring_profiles
    where user_id = p_user_id and role <> 'admin';
  end if;
  if package_value is null or package_value not in ('P1', 'P2', 'P3', 'SIMONTOK_PREMIUM', 'BILLMAN_PRO') then
    raise exception 'Pengguna tidak memiliki paket premium yang dapat ditagihkan';
  end if;
  insert into public.monitoring_premium_payments (user_id, billing_month, package_code, amount, paid_at, payment_note, marked_by, updated_at)
  values (p_user_id, month_start, package_value, amount_value, p_paid_at, nullif(trim(coalesce(p_note, '')), ''),
    case when p_paid_at is null then null else auth.uid() end, now())
  on conflict on constraint monitoring_premium_payments_user_month_key do update
  set paid_at = excluded.paid_at, payment_note = excluded.payment_note, marked_by = excluded.marked_by, updated_at = now();
end;
$$;

create or replace function public.admin_set_premium_access(p_user_id uuid, p_package text, p_active_from date, p_active_until date, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare previous_package text; previous_until date;
begin
  if not exists (select 1 from public.monitoring_profiles p where p.user_id = auth.uid() and p.role = 'admin') then
    raise exception 'Hanya admin yang dapat mengelola premium';
  end if;
  if p_package is null or p_package not in ('SIMONTOK_PREMIUM', 'BILLMAN_PRO') then raise exception 'Paket premium tidak valid'; end if;
  if p_active_from is null or p_active_until is null or p_active_until < p_active_from then raise exception 'Periode premium tidak valid'; end if;
  select p.premium_package, p.premium_active_until into previous_package, previous_until
  from public.monitoring_profiles p where p.user_id = p_user_id and p.role <> 'admin' for update;
  if not found then raise exception 'Pengguna premium tidak ditemukan'; end if;
  update public.monitoring_profiles set premium_package = p_package, premium_active_from = p_active_from,
    premium_active_until = p_active_until, premium_admin_note = nullif(trim(coalesce(p_note, '')), ''),
    premium_updated_by = auth.uid(), premium_updated_at = now() where user_id = p_user_id;
  insert into public.monitoring_premium_history (user_id, action, package_code, active_from, active_until, admin_note, changed_by)
  values (p_user_id, case when previous_package is null or previous_until is null then 'activated' else 'updated' end,
    p_package, p_active_from, p_active_until, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
end;
$$;

revoke all on function public._premium_billing_status(uuid, date) from public, anon, authenticated;
revoke all on function public.admin_set_premium_access(uuid, text, date, date, text) from public, anon;
grant execute on function public.admin_set_premium_access(uuid, text, date, date, text) to authenticated;
commit;
