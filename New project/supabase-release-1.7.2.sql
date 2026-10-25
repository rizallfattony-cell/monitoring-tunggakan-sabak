-- APK 1.7.2 harus tersedia di hosting dan lulus tes sebelum menjalankan file ini.
\set ON_ERROR_STOP on
\ir supabase-schema-step-19-premium-billing-gate.sql

begin;
insert into public.monitoring_app_releases (
  id, latest_version, minimum_version, download_url, message, force_update
) values (
  'android', '1.7.2', '1.7.2',
  'https://simontok-superweb.vercel.app/SIMONTOK-v1.7.2.apk',
  'Perbarui SIMONTOK untuk pengingat tagihan bulanan dan sinkronisasi pembayaran premium dengan admin.',
  true
)
on conflict (id) do update set
  latest_version = excluded.latest_version,
  minimum_version = excluded.minimum_version,
  download_url = excluded.download_url,
  message = excluded.message,
  force_update = excluded.force_update,
  updated_at = now();
select id, latest_version, minimum_version, download_url, force_update
from public.monitoring_app_releases where id = 'android';
commit;
