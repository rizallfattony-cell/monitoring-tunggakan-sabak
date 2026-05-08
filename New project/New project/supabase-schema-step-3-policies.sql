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
