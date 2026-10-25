\set ON_ERROR_STOP on
do $$ begin
  if exists(select 1 from public.monitoring_app_releases where id='android'
    and string_to_array(latest_version,'.')::int[] > array[1,7,4]) then
    raise exception 'Versi produksi lebih baru; jangan menerapkan rilis lama.';
  end if;
end $$;
select to_regprocedure('public.get_my_premium_billing_status()') is not null as billing_ready \gset
\if :billing_ready
\else
\ir supabase-schema-step-19-premium-billing-gate.sql
\endif
\ir supabase-schema-step-20-premium-packages.sql
\ir supabase-schema-step-21-receipt-history.sql
