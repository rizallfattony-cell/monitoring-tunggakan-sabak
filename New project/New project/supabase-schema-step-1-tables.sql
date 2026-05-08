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
