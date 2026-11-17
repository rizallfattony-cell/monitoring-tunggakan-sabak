-- Store the customer-level rows from Kogol 3/4 ending-balance uploads so the
-- web receipt tool can find them. Android debt sync remains Kogol 0 only.
create table if not exists public.monitoring_kogol_receipt_customers (
  snapshot_date date not null,
  kogol_key text not null,
  idpel text not null,
  nama text not null default '',
  tarif text not null default '',
  daya text not null default '',
  rptag numeric not null default 0 check (rptag >= 0),
  billing_periods jsonb not null default '[]'::jsonb,
  stand_awal text not null default '',
  stand_akhir text not null default '',
  source_file text not null default '',
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null references auth.users(id),
  primary key (snapshot_date, kogol_key, idpel),
  check (kogol_key in ('KOGOL_3_PERKANTORAN', 'KOGOL_3_LPJU', 'KOGOL_4')),
  check (idpel ~ '^[0-9]{10,16}$'),
  check (jsonb_typeof(billing_periods) = 'array'),
  check (length(source_file) <= 255),
  check (source_file !~ '[[:cntrl:]]')
);

create index if not exists monitoring_kogol_receipt_customers_lookup_idx
  on public.monitoring_kogol_receipt_customers (idpel, snapshot_date desc, uploaded_at desc);

create index if not exists monitoring_kogol_receipt_customers_latest_idx
  on public.monitoring_kogol_receipt_customers (kogol_key, snapshot_date desc);

alter table public.monitoring_kogol_receipt_customers enable row level security;
revoke all on public.monitoring_kogol_receipt_customers from public, anon, authenticated;

create or replace function public.save_kogol_debt_upload(
  p_snapshot_date date,
  p_source_file text,
  p_rows jsonb,
  p_customers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_file text := trim(coalesce(p_source_file, ''));
  saved_details integer := 0;
  snapshot_result jsonb;
begin
  if auth.uid() is null or not public.debt_performance_is_admin() then
    raise exception 'Hanya admin yang dapat menyimpan detail saldo Kogol';
  end if;
  if p_customers is null or jsonb_typeof(p_customers) <> 'array'
    or jsonb_array_length(p_customers) > 50000 then
    raise exception 'Detail saldo Kogol harus berupa array maksimal 50.000 pelanggan';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_customers) item
    where jsonb_typeof(item) <> 'object'
      or upper(trim(coalesce(item->>'kogol_key', ''))) not in (
        'KOGOL_3_PERKANTORAN', 'KOGOL_3_LPJU', 'KOGOL_4'
      )
      or coalesce(item->>'idpel', '') !~ '^[0-9]{10,16}$'
      or coalesce(item->>'rptag', '') !~ '^\d{1,18}$'
      or length(coalesce(item->>'nama', '')) > 255
      or length(coalesce(item->>'tarif', '')) > 64
      or length(coalesce(item->>'daya', '')) > 64
      or length(coalesce(item->>'stand_awal', '')) > 64
      or length(coalesce(item->>'stand_akhir', '')) > 64
      or (
        item ? 'billing_periods'
        and jsonb_typeof(item->'billing_periods') <> 'array'
      )
  ) then
    raise exception 'Isi detail saldo Kogol tidak valid';
  end if;
  if (
    select count(*) <> count(distinct (upper(trim(item->>'kogol_key')) || ':' || (item->>'idpel')))
    from jsonb_array_elements(p_customers) item
  ) then
    raise exception 'IDPEL pada kelompok Kogol yang sama tidak boleh duplikat';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_customers) customer
    where not exists (
      select 1
      from jsonb_array_elements(p_rows) snapshot
      where upper(trim(snapshot->>'kogol_key')) = upper(trim(customer->>'kogol_key'))
    )
  ) then
    raise exception 'Kelompok detail pelanggan tidak cocok dengan snapshot Kogol';
  end if;

  snapshot_result := public.save_kogol_debt_snapshot(p_snapshot_date, normalized_file, p_rows);

  delete from public.monitoring_kogol_receipt_customers existing
  where existing.snapshot_date = p_snapshot_date
    and existing.kogol_key in (
      select upper(trim(snapshot->>'kogol_key'))
      from jsonb_array_elements(p_rows) snapshot
      where upper(trim(snapshot->>'kogol_key')) in (
        'KOGOL_3_PERKANTORAN', 'KOGOL_3_LPJU', 'KOGOL_4'
      )
    );

  insert into public.monitoring_kogol_receipt_customers (
    snapshot_date, kogol_key, idpel, nama, tarif, daya, rptag,
    billing_periods, stand_awal, stand_akhir, source_file, uploaded_at, uploaded_by
  )
  select
    p_snapshot_date,
    upper(trim(item->>'kogol_key')),
    item->>'idpel',
    left(trim(coalesce(item->>'nama', '')), 255),
    left(trim(coalesce(item->>'tarif', '')), 64),
    left(trim(coalesce(item->>'daya', '')), 64),
    (item->>'rptag')::numeric,
    case when jsonb_typeof(item->'billing_periods') = 'array'
      then item->'billing_periods' else '[]'::jsonb end,
    left(trim(coalesce(item->>'stand_awal', '')), 64),
    left(trim(coalesce(item->>'stand_akhir', '')), 64),
    normalized_file,
    now(),
    auth.uid()
  from jsonb_array_elements(p_customers) item;

  get diagnostics saved_details = row_count;
  return snapshot_result || jsonb_build_object('saved_details', saved_details);
end;
$$;

revoke all on function public.save_kogol_debt_upload(date, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_kogol_debt_upload(date, text, jsonb, jsonb) to authenticated;

create or replace function public.lookup_receipt_customers(p_idpels text[])
returns table (
  idpel text,
  nama text,
  tarif text,
  daya text,
  rptag numeric,
  billing_periods jsonb,
  uploaded_at timestamptz,
  stand_awal text,
  stand_akhir text,
  admin_fee numeric,
  nama_toko text,
  alamat_toko text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  actor_petugas text;
  actor_is_operator boolean;
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan untuk mencetak struk' using errcode = '42501';
  end if;
  if p_idpels is null or cardinality(p_idpels) not between 1 and 20
    or exists (select 1 from unnest(p_idpels) as ids(value) where value is null or value !~ '^[0-9]{10,16}$')
    or (select count(distinct value) from unnest(p_idpels) as ids(value)) <> cardinality(p_idpels) then
    raise exception 'Masukkan 1 sampai 20 IDPEL unik (10-16 digit)' using errcode = '22023';
  end if;

  select profile.role, profile.petugas
  into actor_role, actor_petugas
  from public.monitoring_profiles profile
  where profile.user_id = auth.uid();

  select exists (
    select 1 from public.monitoring_receipt_operators operator
    where operator.user_id = auth.uid()
  ) into actor_is_operator;

  if coalesce(actor_role, '') not in ('admin', 'petugas') and not actor_is_operator then
    raise exception 'Akun tidak memiliki izin cetak struk' using errcode = '42501';
  end if;

  return query
  with latest_kogol_dates as (
    select customer.kogol_key, max(customer.snapshot_date) as snapshot_date
    from public.monitoring_kogol_receipt_customers customer
    group by customer.kogol_key
  ),
  regular_rows as (
    select
      customer.idpel, customer.nama, customer.tarif, customer.daya, customer.rptag,
      coalesce(to_jsonb(customer)->'billing_periods', '[]'::jsonb) as billing_periods,
      customer.uploaded_at,
      ''::text as stand_awal,
      ''::text as stand_akhir,
      1 as source_priority,
      customer.id as source_id
    from public.monitoring_remaining_customers customer
    where customer.report_id = 'main'
      and customer.idpel = any(p_idpels)
      and customer.rptag > 0
      and (
        actor_role = 'admin'
        or actor_is_operator
        or (actor_role = 'petugas' and upper(trim(customer.petugas)) = upper(trim(coalesce(actor_petugas, ''))))
      )
  ),
  kogol_rows as (
    select
      customer.idpel, customer.nama, customer.tarif, customer.daya, customer.rptag,
      customer.billing_periods, customer.uploaded_at,
      customer.stand_awal, customer.stand_akhir,
      2 as source_priority,
      0::bigint as source_id
    from public.monitoring_kogol_receipt_customers customer
    join latest_kogol_dates latest
      on latest.kogol_key = customer.kogol_key
      and latest.snapshot_date = customer.snapshot_date
    where customer.idpel = any(p_idpels) and customer.rptag > 0
  ),
  combined as (
    select * from regular_rows
    union all
    select * from kogol_rows
  ),
  matched as (
    select distinct on (customer.idpel)
      customer.idpel, customer.nama, customer.tarif, customer.daya, customer.rptag,
      customer.billing_periods, customer.uploaded_at,
      customer.stand_awal, customer.stand_akhir
    from combined customer
    order by customer.idpel, customer.uploaded_at desc, customer.source_priority desc, customer.source_id desc
  )
  select
    matched.idpel,
    matched.nama,
    matched.tarif,
    matched.daya,
    matched.rptag,
    matched.billing_periods,
    matched.uploaded_at,
    coalesce(nullif(matched.stand_awal, ''), meter.stand_awal, ''),
    coalesce(nullif(matched.stand_akhir, ''), meter.stand_akhir, ''),
    coalesce(settings.admin_fee, 5000::numeric),
    coalesce(settings.nama_toko, 'PLN MOBILE'),
    coalesce(settings.alamat_toko, 'PLN ULP SABAK')
  from matched
  left join public.monitoring_receipt_meters meter
    on meter.report_id = 'main' and meter.idpel = matched.idpel
  left join public.monitoring_receipt_settings settings on settings.id = 'main'
  order by array_position(p_idpels, matched.idpel);
end;
$$;

revoke all on function public.lookup_receipt_customers(text[]) from public, anon;
grant execute on function public.lookup_receipt_customers(text[]) to authenticated;

-- Keep older deployed clients compatible while the web switches to the
-- general lookup function above.
create or replace function public.lookup_receipt_operator_customers(p_idpels text[])
returns table (
  idpel text,
  nama text,
  tarif text,
  daya text,
  rptag numeric,
  billing_periods jsonb,
  uploaded_at timestamptz,
  stand_awal text,
  stand_akhir text,
  admin_fee numeric,
  nama_toko text,
  alamat_toko text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.monitoring_is_receipt_operator()
    or exists (select 1 from public.monitoring_profiles profile where profile.user_id = auth.uid()) then
    raise exception 'Akun tidak memiliki izin cetak struk' using errcode = '42501';
  end if;
  return query select * from public.lookup_receipt_customers(p_idpels);
end;
$$;

revoke all on function public.lookup_receipt_operator_customers(text[]) from public, anon;
grant execute on function public.lookup_receipt_operator_customers(text[]) to authenticated;
