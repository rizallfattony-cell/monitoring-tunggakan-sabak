create table if not exists public.monitoring_receipt_meters (
  id bigserial primary key,
  report_id text not null default 'main',
  idpel text not null,
  stand_awal text,
  stand_akhir text,
  uploaded_at timestamptz not null default now(),
  unique (report_id, idpel)
);

create table if not exists public.monitoring_receipt_settings (
  id text primary key default 'main',
  nama_toko text not null default 'PLN MOBILE',
  alamat_toko text not null default 'PLN ULP SABAK',
  admin_fee numeric not null default 5000,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.monitoring_receipt_settings (id, nama_toko, alamat_toko, admin_fee)
values ('main', 'PLN MOBILE', 'PLN ULP SABAK', 5000)
on conflict (id) do nothing;

create index if not exists monitoring_receipt_meters_lookup_idx
on public.monitoring_receipt_meters (report_id, idpel);

alter table public.monitoring_receipt_meters enable row level security;
alter table public.monitoring_receipt_settings enable row level security;

drop policy if exists "receipt meters read authenticated" on public.monitoring_receipt_meters;
drop policy if exists "receipt meters insert admin" on public.monitoring_receipt_meters;
drop policy if exists "receipt meters update admin" on public.monitoring_receipt_meters;
drop policy if exists "receipt meters delete admin" on public.monitoring_receipt_meters;
drop policy if exists "receipt settings read authenticated" on public.monitoring_receipt_settings;
drop policy if exists "receipt settings write admin" on public.monitoring_receipt_settings;

create policy "receipt meters read authenticated"
on public.monitoring_receipt_meters
for select
to authenticated
using (true);

create policy "receipt meters insert admin"
on public.monitoring_receipt_meters
for insert
to authenticated
with check (public.monitoring_current_role() = 'admin');

create policy "receipt meters update admin"
on public.monitoring_receipt_meters
for update
to authenticated
using (public.monitoring_current_role() = 'admin')
with check (public.monitoring_current_role() = 'admin');

create policy "receipt meters delete admin"
on public.monitoring_receipt_meters
for delete
to authenticated
using (public.monitoring_current_role() = 'admin');

create policy "receipt settings read authenticated"
on public.monitoring_receipt_settings
for select
to authenticated
using (true);

create policy "receipt settings write admin"
on public.monitoring_receipt_settings
for all
to authenticated
using (public.monitoring_current_role() = 'admin')
with check (public.monitoring_current_role() = 'admin');
