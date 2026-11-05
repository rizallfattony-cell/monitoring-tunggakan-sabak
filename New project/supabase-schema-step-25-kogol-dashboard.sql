-- Kogol snapshots are intentionally separate from the app debt payload.
-- They are used by the web dashboard only and never publish data to mobile users.
create table if not exists public.monitoring_kogol_debt_snapshots (
  snapshot_date date not null,
  kogol_key text not null,
  saldo_id bigint not null default 0 check (saldo_id >= 0),
  saldo_rupiah bigint not null default 0 check (saldo_rupiah >= 0),
  source_file text not null default '',
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null references auth.users(id),
  primary key (snapshot_date, kogol_key),
  check (kogol_key in ('KOGOL_0', 'KOGOL_3_PERKANTORAN', 'KOGOL_3_LPJU', 'KOGOL_4')),
  check (length(source_file) <= 255),
  check (source_file !~ '[[:cntrl:]]')
);

create index if not exists monitoring_kogol_debt_snapshots_date_idx
  on public.monitoring_kogol_debt_snapshots (snapshot_date desc, kogol_key);

alter table public.monitoring_kogol_debt_snapshots enable row level security;

drop policy if exists kogol_debt_snapshots_admin_read on public.monitoring_kogol_debt_snapshots;
create policy kogol_debt_snapshots_admin_read
on public.monitoring_kogol_debt_snapshots
for select
to authenticated
using (public.debt_performance_is_admin());

revoke all on public.monitoring_kogol_debt_snapshots from public, anon, authenticated;
grant select on public.monitoring_kogol_debt_snapshots to authenticated;

create or replace function public.kogol_dashboard_is_known_group(p_kogol_key text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select upper(trim(coalesce(p_kogol_key, ''))) = any (array[
    'KOGOL_0', 'KOGOL_3_PERKANTORAN', 'KOGOL_3_LPJU', 'KOGOL_4'
  ]);
$$;

revoke all on function public.kogol_dashboard_is_known_group(text) from public, anon, authenticated;

create or replace function public.save_kogol_debt_snapshot(
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
    raise exception 'Hanya admin yang dapat menyimpan snapshot Kogol';
  end if;
  if p_snapshot_date is null
    or p_snapshot_date > today_wib
    or p_snapshot_date < (date_trunc('month', today_wib) - interval '24 months')::date then
    raise exception 'Tanggal snapshot Kogol berada di luar rentang yang diizinkan';
  end if;
  if length(normalized_file) > 255 or normalized_file ~ '[[:cntrl:]]' then
    raise exception 'Nama file sumber tidak valid';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 4 then
    raise exception 'Snapshot Kogol harus berisi 1 sampai 4 kelompok';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) <> 'object'
      or not public.kogol_dashboard_is_known_group(item->>'kogol_key')
      or coalesce(item->>'saldo_id', '') !~ '^\d{1,12}$'
      or coalesce(item->>'saldo_rupiah', '') !~ '^\d{1,18}$'
  ) then
    raise exception 'Isi snapshot Kogol tidak valid';
  end if;
  if (
    select count(*) <> count(distinct upper(trim(item->>'kogol_key')))
    from jsonb_array_elements(p_rows) item
  ) then
    raise exception 'Kelompok Kogol pada satu snapshot tidak boleh duplikat';
  end if;

  insert into public.monitoring_kogol_debt_snapshots (
    snapshot_date, kogol_key, saldo_id, saldo_rupiah, source_file, uploaded_at, uploaded_by
  )
  select p_snapshot_date,
    upper(trim(item->>'kogol_key')),
    (item->>'saldo_id')::bigint,
    (item->>'saldo_rupiah')::bigint,
    normalized_file,
    now(),
    auth.uid()
  from jsonb_array_elements(p_rows) item
  on conflict (snapshot_date, kogol_key) do update
  set saldo_id = excluded.saldo_id,
      saldo_rupiah = excluded.saldo_rupiah,
      source_file = excluded.source_file,
      uploaded_at = excluded.uploaded_at,
      uploaded_by = excluded.uploaded_by;

  get diagnostics saved_count = row_count;
  return jsonb_build_object(
    'snapshot_date', p_snapshot_date,
    'saved', saved_count,
    'uploaded_at', now()
  );
end;
$$;

revoke all on function public.save_kogol_debt_snapshot(date, text, jsonb) from public, anon;
grant execute on function public.save_kogol_debt_snapshot(date, text, jsonb) to authenticated;
