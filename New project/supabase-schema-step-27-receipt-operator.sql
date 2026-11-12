-- Dedicated print accounts live outside monitoring_profiles so they do not
-- become billers in premium and operational reports.
create table if not exists public.monitoring_receipt_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.monitoring_receipt_operators enable row level security;
revoke all on public.monitoring_receipt_operators from public, anon, authenticated;
grant select on public.monitoring_receipt_operators to authenticated;

drop policy if exists "receipt operators read own" on public.monitoring_receipt_operators;
create policy "receipt operators read own"
  on public.monitoring_receipt_operators for select to authenticated
  using (user_id = auth.uid());

create or replace function public.monitoring_is_receipt_operator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.monitoring_receipt_operators o where o.user_id = auth.uid()
  )
$$;

revoke all on function public.monitoring_is_receipt_operator() from public, anon, authenticated;
grant execute on function public.monitoring_is_receipt_operator() to authenticated;

-- Existing admin and petugas access is unchanged; print accounts cannot read
-- these tables directly, even if another permissive policy is added later.
drop policy if exists "receipt operator no direct customers" on public.monitoring_remaining_customers;
create policy "receipt operator no direct customers"
  on public.monitoring_remaining_customers as restrictive for select to authenticated
  using (not public.monitoring_is_receipt_operator());

drop policy if exists "receipt operator no direct meters" on public.monitoring_receipt_meters;
create policy "receipt operator no direct meters"
  on public.monitoring_receipt_meters as restrictive for select to authenticated
  using (not public.monitoring_is_receipt_operator());

drop policy if exists "receipt operator no direct settings" on public.monitoring_receipt_settings;
create policy "receipt operator no direct settings"
  on public.monitoring_receipt_settings as restrictive for select to authenticated
  using (not public.monitoring_is_receipt_operator());

create index if not exists monitoring_remaining_customers_receipt_lookup_idx
  on public.monitoring_remaining_customers (report_id, idpel);

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
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.monitoring_is_receipt_operator()
    or exists (select 1 from public.monitoring_profiles p where p.user_id = auth.uid()) then
    raise exception 'Akun tidak memiliki izin cetak struk' using errcode = '42501';
  end if;

  if p_idpels is null or cardinality(p_idpels) not between 1 and 20
    or exists (select 1 from unnest(p_idpels) as ids(value) where value is null or value !~ '^[0-9]{10,16}$')
    or (select count(distinct value) from unnest(p_idpels) as ids(value)) <> cardinality(p_idpels) then
    raise exception 'Masukkan 1 sampai 20 IDPEL unik (10-16 digit)' using errcode = '22023';
  end if;

  return query
  with matched as (
    select distinct on (c.idpel)
      c.idpel, c.nama, c.tarif, c.daya, c.rptag,
      coalesce(to_jsonb(c)->'billing_periods', '[]'::jsonb) as billing_periods,
      c.uploaded_at, c.id
    from public.monitoring_remaining_customers c
    where c.report_id = 'main' and c.idpel = any(p_idpels) and c.rptag > 0
    order by c.idpel, c.uploaded_at desc, c.id desc
  )
  select m.idpel, m.nama, m.tarif, m.daya, m.rptag, m.billing_periods,
    m.uploaded_at, meter.stand_awal, meter.stand_akhir,
    coalesce(settings.admin_fee, 5000::numeric),
    coalesce(settings.nama_toko, 'PLN MOBILE'),
    coalesce(settings.alamat_toko, 'PLN ULP SABAK')
  from matched m
  left join public.monitoring_receipt_meters meter
    on meter.report_id = 'main' and meter.idpel = m.idpel
  left join public.monitoring_receipt_settings settings on settings.id = 'main'
  order by array_position(p_idpels, m.idpel);
end;
$$;

revoke all on function public.lookup_receipt_operator_customers(text[]) from public, anon, authenticated;
grant execute on function public.lookup_receipt_operator_customers(text[]) to authenticated;
