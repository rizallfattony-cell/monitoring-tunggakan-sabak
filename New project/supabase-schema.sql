create table if not exists public.monitoring_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.monitoring_app_state enable row level security;

create policy "monitoring state select authenticated"
on public.monitoring_app_state
for select
to authenticated
using (true);

create policy "monitoring state insert authenticated"
on public.monitoring_app_state
for insert
to authenticated
with check (auth.uid() = updated_by);

create policy "monitoring state update authenticated"
on public.monitoring_app_state
for update
to authenticated
using (true)
with check (auth.uid() = updated_by);
