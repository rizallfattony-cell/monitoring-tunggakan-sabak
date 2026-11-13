\set ON_ERROR_STOP on
do $$ begin
  if exists(select 1 from public.monitoring_app_releases where id='android'
    and string_to_array(latest_version,'.')::int[] > array[1,7,6]) then
    raise exception 'Versi produksi lebih baru; jangan menerapkan rilis lama.';
  end if;
  if to_regprocedure('public.get_my_premium_access(text)') is null
    or to_regclass('public.monitoring_remaining_customers') is null then
    raise exception 'Database produksi belum memiliki fungsi dan tabel yang diperlukan APK.';
  end if;
end $$;
