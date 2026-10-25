-- Jalankan setelah step 18. Tidak mengubah data pembayaran yang sudah tersimpan.
begin;

create or replace function public._premium_billing_status(p_user_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  if profile.role = 'admin' or coalesce(profile.premium_package, 'FREE') not in ('P1', 'P2', 'P3') then
    return jsonb_build_object(
      'enrolled', false, 'should_remind', false, 'access_blocked', false,
      'reason', 'exempt', 'server_date', p_today,
      'next_check_at', ((p_today + 1)::timestamp at time zone 'Asia/Jakarta'),
      'next_check_at_ms', (extract(epoch from ((p_today + 1)::timestamp at time zone 'Asia/Jakarta')) * 1000)::bigint
    );
  end if;

  -- Snapshot paket/nominal tidak berubah ketika admin mengganti paket kemudian.
  insert into public.monitoring_premium_payments (user_id, billing_month, package_code, amount)
  values (
    p_user_id, month_start, profile.premium_package,
    case profile.premium_package when 'P1' then 15000 when 'P2' then 25000 when 'P3' then 50000 end
  )
  on conflict on constraint monitoring_premium_payments_user_month_key do nothing;

  -- Tagihan tertunggak tetap mengunci setelah berganti bulan sampai admin mencatat pembayaran.
  select * into payment
  from public.monitoring_premium_payments
  where user_id = p_user_id and paid_at is null and amount > 0
    and billing_month + 19 <= p_today
  order by billing_month
  limit 1;

  if not found then
    select * into payment from public.monitoring_premium_payments
    where user_id = p_user_id and billing_month = month_start;
  end if;

  due_start := payment.billing_month + 19;
  due_end := (payment.billing_month + interval '1 month - 1 day')::date;
  lock_start := due_end - 2;
  remind := payment.paid_at is null and payment.amount > 0 and p_today >= due_start;
  blocked := remind and p_today >= lock_start;

  return jsonb_build_object(
    'enrolled', true, 'billing_month', payment.billing_month,
    'package_code', payment.package_code, 'amount', payment.amount,
    'due_start', due_start, 'due_end', due_end, 'lock_start', lock_start,
    'paid_at', payment.paid_at, 'should_remind', remind, 'access_blocked', blocked,
    'reason', case when blocked then 'blocked' when remind then 'unpaid'
                   when payment.paid_at is not null then 'paid' else 'before_due' end,
    'server_date', p_today,
    'next_check_at', ((p_today + 1)::timestamp at time zone 'Asia/Jakarta'),
    'next_check_at_ms', (extract(epoch from ((p_today + 1)::timestamp at time zone 'Asia/Jakarta')) * 1000)::bigint
  );
end;
$$;

-- Tidak menerima user_id/tanggal dari APK: identitas dan waktu berasal dari server.
create or replace function public.get_my_premium_billing_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_id_value uuid := auth.uid();
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  if user_id_value is null then raise exception 'Silakan login terlebih dahulu'; end if;
  return public._premium_billing_status(user_id_value, today_wib)
    || jsonb_build_object(
      'server_now', statement_timestamp(),
      'server_now_ms', floor(extract(epoch from statement_timestamp()) * 1000)::bigint
    );
end;
$$;

-- Rekap web memakai batas hari dan bulan WIB yang sama dengan APK.
create or replace function public.admin_list_premium_payments(p_billing_month date)
returns table (
  user_id uuid, username text, petugas text, package_code text, amount bigint,
  billing_month date, due_start date, due_end date, paid_at date,
  payment_note text, payment_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  month_start date := date_trunc('month', coalesce(p_billing_month, today_wib))::date;
  month_end date := (month_start + interval '1 month - 1 day')::date;
begin
  if not exists (select 1 from public.monitoring_profiles where monitoring_profiles.user_id = auth.uid() and role = 'admin') then
    raise exception 'Hanya admin yang dapat melihat rekap pembayaran premium';
  end if;
  insert into public.monitoring_premium_payments (user_id, billing_month, package_code, amount)
  select profile.user_id, month_start, profile.premium_package,
    case profile.premium_package when 'P1' then 15000 when 'P2' then 25000 when 'P3' then 50000 end
  from public.monitoring_profiles profile
  where profile.role <> 'admin' and profile.premium_package in ('P1', 'P2', 'P3')
    and month_start = date_trunc('month', today_wib)::date
  on conflict on constraint monitoring_premium_payments_user_month_key do nothing;

  return query select payment.user_id, upper(split_part(profile.email, '@', 1)),
    coalesce(nullif(profile.petugas, ''), upper(split_part(profile.email, '@', 1))),
    payment.package_code, payment.amount, payment.billing_month, month_start + 19,
    month_end, payment.paid_at, payment.payment_note,
    case when payment.paid_at is not null then 'paid'
         when today_wib > month_end then 'overdue' else 'unpaid' end
  from public.monitoring_premium_payments payment
  join public.monitoring_profiles profile on profile.user_id = payment.user_id
  where payment.billing_month = month_start
  order by case when payment.paid_at is null then 0 else 1 end,
    coalesce(nullif(profile.petugas, ''), profile.email);
end;
$$;

-- Pembayaran terlambat boleh dicatat pada tanggal sebenarnya, tidak boleh di masa depan.
create or replace function public.admin_set_premium_payment(
  p_user_id uuid, p_billing_month date, p_paid_at date, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  month_start date := date_trunc('month', coalesce(p_billing_month, today_wib))::date;
  package_value text;
  amount_value bigint;
begin
  if not exists (select 1 from public.monitoring_profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'Hanya admin yang dapat mengubah pembayaran premium';
  end if;
  if month_start > date_trunc('month', today_wib)::date then
    raise exception 'Bulan tagihan belum dimulai';
  end if;
  if p_paid_at is not null and (p_paid_at < month_start + 19 or p_paid_at > today_wib) then
    raise exception 'Tanggal pembayaran harus sejak tanggal 20 bulan tagihan sampai hari ini (WIB)';
  end if;

  select package_code, amount into package_value, amount_value
  from public.monitoring_premium_payments where user_id = p_user_id and billing_month = month_start;
  if not found then
    if month_start <> date_trunc('month', today_wib)::date then
      raise exception 'Tagihan bulan tersebut tidak ditemukan';
    end if;
    select premium_package,
      case premium_package when 'P1' then 15000 when 'P2' then 25000 when 'P3' then 50000 end
    into package_value, amount_value from public.monitoring_profiles
    where user_id = p_user_id and role <> 'admin';
  end if;
  if package_value is null or package_value not in ('P1', 'P2', 'P3') then
    raise exception 'Pengguna tidak memiliki paket premium yang dapat ditagihkan';
  end if;

  insert into public.monitoring_premium_payments (
    user_id, billing_month, package_code, amount, paid_at, payment_note, marked_by, updated_at
  ) values (
    p_user_id, month_start, package_value, amount_value, p_paid_at,
    nullif(trim(coalesce(p_note, '')), ''),
    case when p_paid_at is null then null else auth.uid() end, now()
  )
  on conflict on constraint monitoring_premium_payments_user_month_key do update
  set paid_at = excluded.paid_at, payment_note = excluded.payment_note,
      marked_by = excluded.marked_by, updated_at = now();
end;
$$;

revoke all on function public._premium_billing_status(uuid, date) from public, anon, authenticated;
revoke all on function public.get_my_premium_billing_status() from public, anon;
grant execute on function public.get_my_premium_billing_status() to authenticated;
revoke all on function public.admin_set_premium_payment(uuid, date, date, text) from public, anon;
grant execute on function public.admin_set_premium_payment(uuid, date, date, text) to authenticated;

commit;
