-- Daily debt snapshots used only by the web performance dashboard.
create table if not exists public.monitoring_debt_performance_daily (
  snapshot_date date not null,
  petugas text not null,
  saldo_id bigint not null default 0 check (saldo_id >= 0),
  saldo_rupiah bigint not null default 0 check (saldo_rupiah >= 0),
  source_file text not null default '',
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null references auth.users(id),
  primary key (snapshot_date, petugas),
  check (length(trim(petugas)) between 1 and 100),
  check (petugas !~ '[[:cntrl:]]'),
  check (length(source_file) <= 255),
  check (source_file !~ '[[:cntrl:]]')
);

create index if not exists monitoring_debt_performance_daily_petugas_date_idx
  on public.monitoring_debt_performance_daily (upper(petugas), snapshot_date desc);

alter table public.monitoring_debt_performance_daily enable row level security;

drop policy if exists debt_performance_daily_read on public.monitoring_debt_performance_daily;
create policy debt_performance_daily_read
on public.monitoring_debt_performance_daily
for select
to authenticated
using (
  public.debt_performance_is_admin()
  or upper(petugas) = public.debt_performance_current_petugas()
);

revoke all on public.monitoring_debt_performance_daily from public, anon, authenticated;
grant select on public.monitoring_debt_performance_daily to authenticated;

create or replace function public.refresh_debt_performance_month_from_daily(
  p_month date,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_month date := date_trunc('month', p_month)::date;
begin
  delete from public.monitoring_debt_performance_monthly
  where month = normalized_month;

  insert into public.monitoring_debt_performance_monthly (
    month, petugas, awal_id, awal_rupiah, akhir_id, akhir_rupiah, captured_at, captured_by
  )
  with ranked as (
    select d.*,
      row_number() over (partition by upper(d.petugas) order by d.snapshot_date, d.uploaded_at) as first_rank,
      row_number() over (partition by upper(d.petugas) order by d.snapshot_date desc, d.uploaded_at desc) as last_rank
    from public.monitoring_debt_performance_daily d
    where d.snapshot_date >= normalized_month
      and d.snapshot_date < (normalized_month + interval '1 month')::date
  )
  select normalized_month,
    upper(petugas),
    max(saldo_id) filter (where first_rank = 1),
    max(saldo_rupiah) filter (where first_rank = 1),
    max(saldo_id) filter (where last_rank = 1),
    max(saldo_rupiah) filter (where last_rank = 1),
    now(),
    p_user
  from ranked
  group by upper(petugas);
end;
$$;

revoke all on function public.refresh_debt_performance_month_from_daily(date, uuid) from public, anon, authenticated;

create or replace function public.save_debt_performance_daily_snapshot(
  p_snapshot_date date,
  p_source_file text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today_wib date := timezone('Asia/Jakarta', now())::date;
  normalized_file text := trim(coalesce(p_source_file, ''));
  saved_count integer;
begin
  if auth.uid() is null or not public.debt_performance_is_admin() then
    raise exception 'Hanya admin yang dapat menyimpan saldo harian performa';
  end if;
  if p_snapshot_date is null
    or p_snapshot_date > today_wib
    or p_snapshot_date < (date_trunc('month', today_wib) - interval '24 months')::date then
    raise exception 'Tanggal saldo harian berada di luar rentang yang diizinkan';
  end if;
  if length(normalized_file) > 255 or normalized_file ~ '[[:cntrl:]]' then
    raise exception 'Nama file sumber tidak valid';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 100 then
    raise exception 'Saldo harian harus berisi 1 sampai 100 petugas';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) <> 'object'
      or length(trim(coalesce(item->>'petugas', ''))) not between 1 and 100
      or trim(item->>'petugas') ~ '[[:cntrl:]]'
      or coalesce(item->>'saldo_id', '') !~ '^\d{1,12}$'
      or coalesce(item->>'saldo_rupiah', '') !~ '^\d{1,18}$'
  ) then
    raise exception 'Isi saldo harian tidak valid';
  end if;
  if (
    select count(*) <> count(distinct upper(trim(item->>'petugas')))
    from jsonb_array_elements(p_rows) item
  ) then
    raise exception 'Nama petugas pada saldo harian tidak boleh duplikat';
  end if;

  delete from public.monitoring_debt_performance_daily
  where snapshot_date = p_snapshot_date;

  insert into public.monitoring_debt_performance_daily (
    snapshot_date, petugas, saldo_id, saldo_rupiah, source_file, uploaded_at, uploaded_by
  )
  select p_snapshot_date,
    upper(trim(item->>'petugas')),
    (item->>'saldo_id')::bigint,
    (item->>'saldo_rupiah')::bigint,
    normalized_file,
    now(),
    auth.uid()
  from jsonb_array_elements(p_rows) item;

  get diagnostics saved_count = row_count;
  perform public.refresh_debt_performance_month_from_daily(p_snapshot_date, auth.uid());
  return jsonb_build_object(
    'snapshot_date', p_snapshot_date,
    'saved', saved_count,
    'uploaded_at', now()
  );
end;
$$;

create or replace function public.delete_debt_performance_daily_snapshot(
  p_snapshot_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null or not public.debt_performance_is_admin() then
    raise exception 'Hanya admin yang dapat menghapus saldo harian performa';
  end if;
  if p_snapshot_date is null then
    raise exception 'Tanggal saldo harian wajib diisi';
  end if;

  delete from public.monitoring_debt_performance_daily
  where snapshot_date = p_snapshot_date;
  get diagnostics deleted_count = row_count;
  perform public.refresh_debt_performance_month_from_daily(p_snapshot_date, auth.uid());

  return jsonb_build_object(
    'snapshot_date', p_snapshot_date,
    'deleted', deleted_count
  );
end;
$$;

revoke all on function public.save_debt_performance_daily_snapshot(date, text, jsonb) from public, anon;
revoke all on function public.delete_debt_performance_daily_snapshot(date) from public, anon;
grant execute on function public.save_debt_performance_daily_snapshot(date, text, jsonb) to authenticated;
grant execute on function public.delete_debt_performance_daily_snapshot(date) to authenticated;
