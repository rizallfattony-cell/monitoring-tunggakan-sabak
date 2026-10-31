\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regprocedure('public.get_my_premium_access(text)') is null
    or to_regprocedure('public.save_receipt_history(jsonb)') is null
    or to_regprocedure('public.get_debt_performance_history(date,integer,text)') is null then
    raise exception 'Terapkan migrasi perangkat premium, riwayat cetak, dan performa tunggakan sebelum update 1.7.5';
  end if;
  if exists(select 1 from public.monitoring_app_releases where id='android'
    and string_to_array(latest_version,'.')::int[] > array[1,7,5]) then
    raise exception 'Versi produksi lebih baru; jangan turunkan versi.';
  end if;
end $$;
insert into public.monitoring_app_releases(id,latest_version,minimum_version,download_url,message,force_update)
values('android','1.7.5','1.7.5','https://simontok-superweb.vercel.app/SIMONTOK-v1.7.5.apk',
 'Perbaikan aktivasi premium setelah verifikasi perangkat, pembacaan perangkat kosong, dan pembaruan status otomatis.',true)
on conflict(id) do update set latest_version=excluded.latest_version,minimum_version=excluded.minimum_version,
 download_url=excluded.download_url,message=excluded.message,force_update=excluded.force_update,updated_at=now();
select id,latest_version,minimum_version,download_url,force_update from public.monitoring_app_releases where id='android';
commit;
