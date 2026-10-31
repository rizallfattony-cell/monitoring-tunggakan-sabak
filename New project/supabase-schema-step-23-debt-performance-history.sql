-- Monthly debt-performance snapshots for the dashboard history.
create table if not exists public.monitoring_debt_performance_monthly (
  month date not null,
  petugas text not null,
  awal_id bigint not null default 0 check (awal_id >= 0),
  awal_rupiah bigint not null default 0 check (awal_rupiah >= 0),
  akhir_id bigint not null default 0 check (akhir_id >= 0),
  akhir_rupiah bigint not null default 0 check (akhir_rupiah >= 0),
  captured_at timestamptz not null default now(),
  captured_by uuid not null references auth.users(id),
  primary key (month, petugas),
  check (month = date_trunc('month', month)::date),
  check (length(trim(petugas)) between 1 and 100),
  check (petugas !~ '[[:cntrl:]]')
);

create index if not exists monitoring_debt_performance_petugas_month_idx
  on public.monitoring_debt_performance_monthly (upper(petugas), month desc);

alter table public.monitoring_debt_performance_monthly enable row level security;

create or replace function public.debt_performance_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.monitoring_profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.debt_performance_current_petugas()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select upper(trim(coalesce(p.petugas, '')))
  from public.monitoring_profiles p
  where p.user_id = auth.uid();
$$;

drop policy if exists debt_performance_read on public.monitoring_debt_performance_monthly;
create policy debt_performance_read
on public.monitoring_debt_performance_monthly
for select
to authenticated
using (
  public.debt_performance_is_admin()
  or upper(petugas) = public.debt_performance_current_petugas()
);

revoke all on public.monitoring_debt_performance_monthly from public, anon, authenticated;
grant select on public.monitoring_debt_performance_monthly to authenticated;

create or replace function public.save_debt_performance_snapshot(
  p_month date,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_month date := date_trunc('month', p_month)::date;
  saved_count integer;
begin
  if auth.uid() is null or not public.debt_performance_is_admin() then
    raise exception 'Hanya admin yang dapat menyimpan riwayat performa';
  end if;
  if p_month is null or p_month <> normalized_month then
    raise exception 'Bulan snapshot harus tanggal pertama pada bulan tersebut';
  end if;
  if normalized_month > date_trunc('month', timezone('Asia/Jakarta', now()))::date
    or normalized_month < (date_trunc('month', timezone('Asia/Jakarta', now())) - interval '24 months')::date then
    raise exception 'Bulan snapshot berada di luar rentang yang diizinkan';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 100 then
    raise exception 'Snapshot performa harus berisi 1 sampai 100 petugas';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) <> 'object'
      or length(trim(coalesce(item->>'petugas', ''))) not between 1 and 100
      or trim(item->>'petugas') ~ '[[:cntrl:]]'
      or coalesce(item->>'awal_id', '') !~ '^\d{1,12}$'
      or coalesce(item->>'awal_rupiah', '') !~ '^\d{1,18}$'
      or coalesce(item->>'akhir_id', '') !~ '^\d{1,12}$'
      or coalesce(item->>'akhir_rupiah', '') !~ '^\d{1,18}$'
  ) then
    raise exception 'Isi snapshot performa tidak valid';
  end if;
  if (
    select count(*) <> count(distinct upper(trim(item->>'petugas')))
    from jsonb_array_elements(p_rows) item
  ) then
    raise exception 'Nama petugas pada snapshot tidak boleh duplikat';
  end if;

  delete from public.monitoring_debt_performance_monthly where month = normalized_month;

  insert into public.monitoring_debt_performance_monthly (
    month, petugas, awal_id, awal_rupiah, akhir_id, akhir_rupiah, captured_at, captured_by
  )
  select normalized_month,
    upper(trim(item->>'petugas')),
    (item->>'awal_id')::bigint,
    (item->>'awal_rupiah')::bigint,
    (item->>'akhir_id')::bigint,
    (item->>'akhir_rupiah')::bigint,
    now(),
    auth.uid()
  from jsonb_array_elements(p_rows) item;

  get diagnostics saved_count = row_count;
  return jsonb_build_object('month', normalized_month, 'saved', saved_count, 'captured_at', now());
end;
$$;

create or replace function public.get_debt_performance_history(
  p_end_month date default null,
  p_months integer default 6,
  p_petugas text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  admin_access boolean := public.debt_performance_is_admin();
  own_petugas text;
  requested_petugas text := nullif(upper(trim(coalesce(p_petugas, ''))), '');
  scope_petugas text;
  end_month date := date_trunc('month', coalesce(p_end_month, timezone('Asia/Jakarta', now())::date))::date;
  start_month date;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  if p_months not in (1, 3, 4, 6, 12) then raise exception 'Rentang bulan tidak valid'; end if;
  if end_month > date_trunc('month', timezone('Asia/Jakarta', now()))::date then
    raise exception 'Bulan akhir tidak boleh melebihi bulan berjalan';
  end if;
  select upper(trim(p.petugas)) into own_petugas
  from public.monitoring_profiles p where p.user_id = auth.uid();
  if not admin_access and coalesce(own_petugas, '') = '' then
    raise exception 'Profil petugas tidak lengkap';
  end if;
  scope_petugas := case when admin_access then requested_petugas else own_petugas end;
  start_month := (end_month - make_interval(months => p_months - 1))::date;

  with months as (
    select generate_series(start_month, end_month, interval '1 month')::date as month
  ), aggregated as (
    select h.month,
      count(*)::integer as officer_count,
      sum(h.awal_id)::bigint as awal_id,
      sum(h.awal_rupiah)::bigint as awal_rupiah,
      sum(h.akhir_id)::bigint as akhir_id,
      sum(h.akhir_rupiah)::bigint as akhir_rupiah,
      max(h.captured_at) as captured_at
    from public.monitoring_debt_performance_monthly h
    where h.month between start_month and end_month
      and (scope_petugas is null or upper(h.petugas) = scope_petugas)
    group by h.month
  ), series as (
    select m.month,
      (a.officer_count is not null) as available,
      coalesce(a.officer_count, 0) as officer_count,
      a.awal_id,
      a.awal_rupiah,
      a.akhir_id,
      a.akhir_rupiah,
      case when a.officer_count is null then null else a.awal_id - a.akhir_id end as pelunasan_id,
      case when a.officer_count is null then null else a.awal_rupiah - a.akhir_rupiah end as pelunasan_rupiah,
      case when coalesce(a.awal_id, 0) = 0 then null
        else round(((a.awal_id - a.akhir_id)::numeric * 100) / a.awal_id, 2) end as persen_id,
      case when coalesce(a.awal_rupiah, 0) = 0 then null
        else round(((a.awal_rupiah - a.akhir_rupiah)::numeric * 100) / a.awal_rupiah, 2) end as persen_tagihan,
      a.captured_at
    from months m left join aggregated a using (month)
    order by m.month
  )
  select jsonb_build_object(
    'scope', coalesce(scope_petugas, 'ALL'),
    'is_admin', admin_access,
    'end_month', end_month,
    'months', p_months,
    'officers', case when admin_access then coalesce((
      select jsonb_agg(name order by name)
      from (select distinct upper(petugas) as name from public.monitoring_debt_performance_monthly) officer_names
    ), '[]'::jsonb) else jsonb_build_array(own_petugas) end,
    'rows', coalesce(jsonb_agg(to_jsonb(series) order by month), '[]'::jsonb)
  ) into result from series;
  return result;
end;
$$;

revoke all on function public.debt_performance_is_admin() from public, anon;
revoke all on function public.debt_performance_current_petugas() from public, anon;
revoke all on function public.save_debt_performance_snapshot(date, jsonb) from public, anon;
revoke all on function public.get_debt_performance_history(date, integer, text) from public, anon;
grant execute on function public.debt_performance_is_admin() to authenticated;
grant execute on function public.debt_performance_current_petugas() to authenticated;
grant execute on function public.save_debt_performance_snapshot(date, jsonb) to authenticated;
grant execute on function public.get_debt_performance_history(date, integer, text) to authenticated;
