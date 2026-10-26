begin;

-- A locked, own-account RPC replaces client PATCH policies and confirms the actual owner.
create or replace function public.get_my_premium_access(p_device_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  profile public.monitoring_profiles%rowtype;
  device_value text := btrim(p_device_id);
  bound_device text;
  today_wib date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  eligible boolean;
begin
  if auth.uid() is null then raise exception 'Sesi pengguna tidak valid'; end if;
  if device_value is null or device_value = '' or length(device_value) > 128
    or lower(device_value) = 'null' or device_value ~ '[[:cntrl:]]' then
    raise exception 'Identitas perangkat tidak valid';
  end if;
  select * into profile from public.monitoring_profiles where user_id = auth.uid() for update;
  if not found then raise exception 'Profil pengguna tidak ditemukan'; end if;
  bound_device := nullif(btrim(profile.premium_device_id), '');
  if lower(bound_device) = 'null' then bound_device := null; end if;
  eligible := coalesce(profile.premium_package in ('P1','P2','P3','SIMONTOK_PREMIUM','BILLMAN_PRO')
    and profile.premium_active_until >= today_wib
    and (profile.premium_active_from is null or profile.premium_active_from <= today_wib),false);
  if eligible and bound_device is null then
    update public.monitoring_profiles set premium_device_id = device_value, premium_device_bound_at = now()
    where user_id = profile.user_id;
    bound_device := device_value;
  end if;
  return jsonb_build_object(
    'premium_package',coalesce(profile.premium_package,'FREE'),
    'premium_active_from',profile.premium_active_from,
    'premium_active_until',profile.premium_active_until,
    'premium_device_id',bound_device,
    'device_bound',eligible and bound_device = device_value,
    'bound_to_other_device',bound_device is not null and bound_device <> device_value,
    'server_date',today_wib);
end;
$$;

revoke all on function public.get_my_premium_access(text) from public,anon;
grant execute on function public.get_my_premium_access(text) to authenticated;
commit;
