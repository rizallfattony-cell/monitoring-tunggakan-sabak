\set ON_ERROR_STOP on
\ir supabase-schema-step-28-fast-offline-sync.sql
do $$ begin
  if exists(select 1 from public.monitoring_app_releases where id='android'
    and string_to_array(latest_version,'.')::int[] > array[1,7,8]) then
    raise exception 'Versi produksi lebih baru; jangan menerapkan rilis lama.';
  end if;
  if to_regprocedure('public.monitoring_sync_offline_page(integer,integer)') is null then
    raise exception 'Fungsi sinkronisasi offline cepat belum tersedia.';
  end if;
end $$;
