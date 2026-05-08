create table if not exists public.monitoring_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'petugas')),
  petugas text,
  created_at timestamptz not null default now()
);

create table if not exists public.monitoring_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.monitoring_remaining_customers (
  id bigserial primary key,
  report_id text not null default 'main',
  petugas text not null,
  idpel text not null,
  nama text,
  tarif text,
  daya text,
  alamat text,
  lembar numeric default 0,
  kolok text,
  koked text,
  rptag numeric default 0,
  uploaded_at timestamptz not null default now(),
  unique (report_id, petugas, idpel)
);

create index if not exists monitoring_remaining_customers_petugas_idx
on public.monitoring_remaining_customers (report_id, petugas, kolok, koked);

create or replace function public.monitoring_current_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role
  from public.monitoring_profiles
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.monitoring_current_petugas()
returns text
language sql
security definer
set search_path = public
as $$
  select petugas
  from public.monitoring_profiles
  where user_id = auth.uid()
  limit 1
$$;

alter table public.monitoring_profiles enable row level security;
alter table public.monitoring_app_state enable row level security;
alter table public.monitoring_remaining_customers enable row level security;

drop policy if exists "profiles read own or admin" on public.monitoring_profiles;
drop policy if exists "profiles insert admin" on public.monitoring_profiles;
drop policy if exists "profiles update admin" on public.monitoring_profiles;

drop policy if exists "monitoring state select authenticated" on public.monitoring_app_state;
drop policy if exists "monitoring state insert authenticated" on public.monitoring_app_state;
drop policy if exists "monitoring state update authenticated" on public.monitoring_app_state;
drop policy if exists "monitoring state select admin" on public.monitoring_app_state;
drop policy if exists "monitoring state insert admin" on public.monitoring_app_state;
drop policy if exists "monitoring state update admin" on public.monitoring_app_state;

drop policy if exists "remaining customers read admin or own petugas" on public.monitoring_remaining_customers;
drop policy if exists "remaining customers insert admin" on public.monitoring_remaining_customers;
drop policy if exists "remaining customers update admin" on public.monitoring_remaining_customers;
drop policy if exists "remaining customers delete admin" on public.monitoring_remaining_customers;

create policy "profiles read own or admin"
on public.monitoring_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.monitoring_current_role() = 'admin'
);

create policy "profiles insert admin"
on public.monitoring_profiles
for insert
to authenticated
with check (
  public.monitoring_current_role() = 'admin'
);

create policy "profiles update admin"
on public.monitoring_profiles
for update
to authenticated
using (
  public.monitoring_current_role() = 'admin'
)
with check (
  public.monitoring_current_role() = 'admin'
);

create policy "monitoring state select admin"
on public.monitoring_app_state
for select
to authenticated
using (
  public.monitoring_current_role() = 'admin'
);

create policy "monitoring state insert admin"
on public.monitoring_app_state
for insert
to authenticated
with check (
  auth.uid() = updated_by
  and public.monitoring_current_role() = 'admin'
);

create policy "monitoring state update admin"
on public.monitoring_app_state
for update
to authenticated
using (
  public.monitoring_current_role() = 'admin'
)
with check (
  auth.uid() = updated_by
  and public.monitoring_current_role() = 'admin'
);

create policy "remaining customers read admin or own petugas"
on public.monitoring_remaining_customers
for select
to authenticated
using (
  public.monitoring_current_role() = 'admin'
  or upper(public.monitoring_current_petugas()) = upper(petugas)
);

create policy "remaining customers insert admin"
on public.monitoring_remaining_customers
for insert
to authenticated
with check (
  public.monitoring_current_role() = 'admin'
);

create policy "remaining customers update admin"
on public.monitoring_remaining_customers
for update
to authenticated
using (
  public.monitoring_current_role() = 'admin'
)
with check (
  public.monitoring_current_role() = 'admin'
);

create policy "remaining customers delete admin"
on public.monitoring_remaining_customers
for delete
to authenticated
using (
  public.monitoring_current_role() = 'admin'
);
