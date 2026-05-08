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
