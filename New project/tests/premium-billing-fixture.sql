-- Fixture minimal. Hanya untuk database lokal kosong sementara.
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.monitoring_profiles (
  user_id uuid primary key references auth.users(id),
  email text, petugas text, role text, premium_package text
);
create table public.monitoring_app_releases (
  id text primary key, latest_version text, minimum_version text,
  download_url text, message text, force_update boolean,
  updated_at timestamptz default now()
);
