\set ON_ERROR_STOP on
do $$ begin
  if exists(select 1 from public.monitoring_app_releases where id='android'
    and string_to_array(latest_version,'.')::int[] > array[1,7,3]) then
    raise exception 'Versi produksi lebih baru. Gunakan script rilis terbaru, jangan turunkan versi.';
  end if;
end $$;
select to_regprocedure('public.get_my_premium_billing_status()') is not null as billing_gate_ready \gset
\if :billing_gate_ready
\else
\ir supabase-schema-step-19-premium-billing-gate.sql
\endif
\ir supabase-schema-step-20-premium-packages.sql

begin;
insert into public.monitoring_app_releases (id, latest_version, minimum_version, download_url, message, force_update)
values ('android', '1.7.3', '1.7.3', 'https://simontok-superweb.vercel.app/SIMONTOK-v1.7.3.apk',
  'Pengingat tagihan per jam, tombol BAYAR dengan salin rekening, dan paket SIMONTOK PREMIUM / BILLMAN PRO.', true)
on conflict (id) do update set latest_version = excluded.latest_version, minimum_version = excluded.minimum_version,
  download_url = excluded.download_url, message = excluded.message, force_update = excluded.force_update, updated_at = now();
select id, latest_version, minimum_version, download_url, force_update from public.monitoring_app_releases where id = 'android';
commit;
