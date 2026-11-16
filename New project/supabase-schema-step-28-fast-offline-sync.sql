begin;

with duplicate_rows as (
  select customer.id,
    row_number() over (
      partition by customer.report_id, customer.petugas, customer.idpel
      order by customer.uploaded_at desc, customer.id desc
    ) as duplicate_number
  from public.monitoring_remaining_customers customer
)
delete from public.monitoring_remaining_customers customer
using duplicate_rows duplicate
where customer.id = duplicate.id and duplicate.duplicate_number > 1;

with duplicate_meters as (
  select meter.id,
    row_number() over (
      partition by meter.report_id, meter.idpel
      order by meter.uploaded_at desc, meter.id desc
    ) as duplicate_number
  from public.monitoring_receipt_meters meter
)
delete from public.monitoring_receipt_meters meter
using duplicate_meters duplicate
where meter.id = duplicate.id and duplicate.duplicate_number > 1;

create unique index if not exists monitoring_remaining_customers_report_petugas_idpel_uidx
  on public.monitoring_remaining_customers (report_id, petugas, idpel);

create unique index if not exists monitoring_receipt_meters_report_idpel_uidx
  on public.monitoring_receipt_meters (report_id, idpel);

create index if not exists monitoring_remaining_customers_offline_sync_idx
  on public.monitoring_remaining_customers (report_id, idpel, uploaded_at desc, id desc);

create or replace function public.monitoring_sync_offline_page(
  p_offset integer default 0,
  p_limit integer default 1000
)
returns table (
  petugas text,
  idpel text,
  nama text,
  tarif text,
  daya text,
  alamat text,
  lembar numeric,
  kolok text,
  koked text,
  rptag numeric,
  uploaded_at timestamptz,
  stand_awal text,
  stand_akhir text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_petugas text;
begin
  if auth.uid() is null then
    raise exception 'Sesi login diperlukan' using errcode = '42501';
  end if;

  select profile.petugas
    into v_petugas
  from public.monitoring_profiles profile
  where profile.user_id = auth.uid();

  if not found then
    raise exception 'Akun tidak memiliki akses sinkronisasi' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit < 1 or p_limit > 1000 then
    raise exception 'Parameter halaman sinkronisasi tidak valid' using errcode = '22023';
  end if;

  return query
  with latest as (
    select distinct on (customer.idpel)
      customer.petugas,
      customer.idpel,
      customer.nama,
      customer.tarif,
      customer.daya,
      customer.alamat,
      customer.lembar,
      customer.kolok,
      customer.koked,
      customer.rptag,
      customer.uploaded_at,
      customer.id
    from public.monitoring_remaining_customers customer
    where customer.report_id = 'main' and customer.rptag > 0
    order by customer.idpel, customer.uploaded_at desc, customer.id desc
  )
  select
    latest.petugas,
    latest.idpel,
    latest.nama,
    latest.tarif,
    latest.daya,
    latest.alamat,
    latest.lembar,
    latest.kolok,
    latest.koked,
    latest.rptag,
    latest.uploaded_at,
    meter.stand_awal,
    meter.stand_akhir
  from latest
  left join lateral (
    select source.stand_awal, source.stand_akhir
    from public.monitoring_receipt_meters source
    where source.report_id = 'main' and source.idpel = latest.idpel
    order by source.uploaded_at desc, source.id desc
    limit 1
  ) meter on true
  order by
    case when v_petugas is not null and upper(latest.petugas) = upper(v_petugas) then 0 else 1 end,
    latest.idpel
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.monitoring_sync_offline_page(integer, integer) from public, anon, authenticated;
grant execute on function public.monitoring_sync_offline_page(integer, integer) to authenticated;

commit;
