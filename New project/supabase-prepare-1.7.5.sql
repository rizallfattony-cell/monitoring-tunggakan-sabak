\set ON_ERROR_STOP on
do $$ begin
  if exists(select 1 from public.monitoring_app_releases where id='android'
    and string_to_array(latest_version,'.')::int[] > array[1,7,5]) then
    raise exception 'Versi produksi lebih baru; jangan menerapkan rilis lama.';
  end if;
  if to_regprocedure('public.save_receipt_history(jsonb)') is null
    or to_regprocedure('public.get_my_premium_billing_status()') is null then
    raise exception 'Terapkan persiapan database 1.7.4 terlebih dahulu.';
  end if;
end $$;
\ir supabase-schema-step-22-premium-device-activation.sql
\ir supabase-schema-step-23-debt-performance-history.sql
