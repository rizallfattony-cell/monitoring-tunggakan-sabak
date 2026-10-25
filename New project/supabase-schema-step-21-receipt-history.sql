begin;

create table if not exists public.monitoring_receipt_history (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  username text not null,
  petugas text not null,
  printed_at timestamptz not null,
  sent_at timestamptz not null,
  transaction_id text not null,
  reference text not null,
  idpel text not null,
  customer_name text not null,
  base_amount bigint not null check (base_amount >= 0),
  extra_amount bigint not null check (extra_amount >= 0),
  admin_amount bigint not null check (admin_amount >= 0),
  total_amount bigint not null,
  snapshot jsonb not null,
  synced_at timestamptz not null default now(),
  check (total_amount = base_amount + extra_amount + admin_amount)
);
create index if not exists receipt_history_owner_date_idx on public.monitoring_receipt_history(user_id, printed_at desc, id);
create index if not exists receipt_history_date_idx on public.monitoring_receipt_history(printed_at, user_id);

create table if not exists public.monitoring_receipt_reprints (
  id uuid primary key,
  receipt_id uuid not null references public.monitoring_receipt_history(id),
  user_id uuid not null references auth.users(id),
  printed_at timestamptz not null,
  synced_at timestamptz not null default now()
);
create index if not exists receipt_reprints_receipt_idx on public.monitoring_receipt_reprints(receipt_id);
alter table public.monitoring_receipt_history enable row level security;
alter table public.monitoring_receipt_reprints enable row level security;

create or replace function public.receipt_history_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.monitoring_profiles where user_id = auth.uid() and role = 'admin');
$$;
drop policy if exists receipt_history_read on public.monitoring_receipt_history;
create policy receipt_history_read on public.monitoring_receipt_history for select to authenticated
using (user_id = auth.uid() or public.receipt_history_is_admin());
drop policy if exists receipt_reprints_read on public.monitoring_receipt_reprints;
create policy receipt_reprints_read on public.monitoring_receipt_reprints for select to authenticated
using (user_id = auth.uid() or public.receipt_history_is_admin());
revoke all on public.monitoring_receipt_history, public.monitoring_receipt_reprints from public, anon, authenticated;
grant select on public.monitoring_receipt_history, public.monitoring_receipt_reprints to authenticated;

create or replace function public.save_receipt_history(p_snapshot jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  owner public.monitoring_profiles%rowtype;
  existing public.monitoring_receipt_history%rowtype;
  receipt_id uuid := (p_snapshot->>'id')::uuid;
begin
  select * into owner from public.monitoring_profiles where user_id = auth.uid();
  if owner.user_id is null then raise exception 'Sesi pengguna tidak valid'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or octet_length(p_snapshot::text) > 65536
    or receipt_id is null or coalesce(p_snapshot->>'print_text', '') = ''
    or coalesce(p_snapshot->>'idpel', '') !~ '^[0-9]{1,30}$'
    or coalesce(p_snapshot->>'transaction_id', '') = '' or coalesce(p_snapshot->>'reference', '') = ''
    or coalesce(p_snapshot->>'customer_name', '') = ''
    or (p_snapshot->>'format_version')::int <> 1
    or (p_snapshot->>'printed_at')::timestamptz is null or (p_snapshot->>'sent_at')::timestamptz is null
    or (p_snapshot->>'printed_at')::timestamptz > now() + interval '1 day'
    or (p_snapshot->>'sent_at')::timestamptz > now() + interval '1 day'
  then raise exception 'Snapshot struk tidak valid'; end if;
  insert into public.monitoring_receipt_history
    (id,user_id,username,petugas,printed_at,sent_at,transaction_id,reference,idpel,customer_name,
     base_amount,extra_amount,admin_amount,total_amount,snapshot)
  values (receipt_id,owner.user_id,upper(split_part(owner.email,'@',1)),
    upper(coalesce(nullif(btrim(owner.petugas),''),split_part(owner.email,'@',1))),
    (p_snapshot->>'printed_at')::timestamptz,(p_snapshot->>'sent_at')::timestamptz,
    p_snapshot->>'transaction_id',p_snapshot->>'reference',p_snapshot->>'idpel',p_snapshot->>'customer_name',
    (p_snapshot->>'base_amount')::bigint,(p_snapshot->>'extra_amount')::bigint,
    (p_snapshot->>'admin_amount')::bigint,(p_snapshot->>'total_amount')::bigint,p_snapshot)
  on conflict (id) do nothing;
  select * into existing from public.monitoring_receipt_history where id = receipt_id;
  if existing.user_id <> owner.user_id or existing.snapshot <> p_snapshot then
    raise exception 'ID struk sudah dipakai dengan data berbeda';
  end if;
end;
$$;

create or replace function public.record_receipt_reprint(p_event_id uuid,p_receipt_id uuid,p_printed_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare existing public.monitoring_receipt_reprints%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.monitoring_receipt_history where id=p_receipt_id and user_id=auth.uid()) then
    raise exception 'Struk tidak ditemukan atau bukan milik pengguna';
  end if;
  if p_event_id is null or p_printed_at is null or p_printed_at > now()+interval '1 day' then
    raise exception 'Event cetak ulang tidak valid';
  end if;
  insert into public.monitoring_receipt_reprints(id,receipt_id,user_id,printed_at)
  values(p_event_id,p_receipt_id,auth.uid(),p_printed_at) on conflict(id) do nothing;
  select * into existing from public.monitoring_receipt_reprints where id=p_event_id;
  if existing.user_id <> auth.uid() or existing.receipt_id <> p_receipt_id or existing.printed_at <> p_printed_at then
    raise exception 'ID event sudah dipakai dengan data berbeda';
  end if;
end;
$$;

create or replace function public.list_receipt_history(p_month date,p_query text default '',p_offset int default 0,
  p_limit int default 50,p_user_id uuid default null,p_petugas text default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; month_start timestamptz; month_end timestamptz; admin_access boolean;
begin
  if auth.uid() is null or p_month is null then raise exception 'Sesi atau bulan tidak valid'; end if;
  admin_access := public.receipt_history_is_admin();
  if p_user_id is not null and p_user_id <> auth.uid() and not admin_access then raise exception 'Akses ditolak'; end if;
  month_start := date_trunc('month',p_month::timestamp) at time zone 'Asia/Jakarta';
  month_end := (date_trunc('month',p_month::timestamp)+interval '1 month') at time zone 'Asia/Jakarta';
  with filtered as (
    select h.*, (select count(*) from public.monitoring_receipt_reprints r where r.receipt_id=h.id) as reprint_count
    from public.monitoring_receipt_history h
    where h.printed_at >= month_start and h.printed_at < month_end
      and (admin_access or h.user_id=auth.uid()) and (p_user_id is null or h.user_id=p_user_id)
      and (p_petugas is null or upper(h.petugas)=upper(p_petugas))
      and (coalesce(p_query,'')='' or position(lower(p_query) in lower(concat_ws(' ',h.username,h.petugas,h.idpel,h.customer_name,h.reference)))>0)
  ), page as (
    select to_jsonb(f)-'snapshot' as item, printed_at, id from filtered f order by printed_at desc,id desc
    limit least(greatest(p_limit,1),200) offset greatest(p_offset,0)
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(item order by printed_at desc,id desc) from page),'[]'::jsonb),
    'total',(select count(*) from filtered)) into result;
  return result;
end;
$$;

create or replace function public.get_receipt_snapshot(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  select h.snapshot || jsonb_build_object('reprint_count',(select count(*) from public.monitoring_receipt_reprints r where r.receipt_id=h.id))
    into result from public.monitoring_receipt_history h
    where h.id=p_id and (h.user_id=auth.uid() or public.receipt_history_is_admin());
  if result is null then raise exception 'Struk tidak ditemukan atau akses ditolak'; end if;
  return result;
end;
$$;

create or replace function public.admin_receipt_monthly_summary(p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.receipt_history_is_admin() then raise exception 'Hanya admin'; end if;
  if p_month is null then raise exception 'Bulan wajib diisi'; end if;
  with roster(petugas) as (values
    ('ADRI'),('ANANG RIDWAN'),('CECEP HIDAYAT'),('DEDI YANTO'),('M. ROBY MASHRUR'),('MUHAMMAD TOHIR'),
    ('SUWARDI'),('TRI WIBOWO'),('ILVAN HALMAHERA'),('AMRIZAL'),('ARBAIN'),('BUNJAMIN'),('DWI WIBOWO'),
    ('EKO DARWANTO'),('HASIM'),('RAHUL FARISTA R'),('NICO DIAN HADINATA')
  ), monthly as (
    select h.*, (select count(*) from public.monitoring_receipt_reprints r where r.receipt_id=h.id) as reprints
    from public.monitoring_receipt_history h
    where h.printed_at >= (date_trunc('month',p_month::timestamp) at time zone 'Asia/Jakarta')
      and h.printed_at < ((date_trunc('month',p_month::timestamp)+interval '1 month') at time zone 'Asia/Jakarta')
  ), names as (
    select petugas from roster union select upper(btrim(petugas)) from monthly
  ), totals as (
    select n.petugas,count(m.id) as transaction_count,coalesce(sum(m.reprints),0) as reprint_count,
      coalesce(sum(m.extra_amount),0) as extra_income
    from names n left join monthly m on upper(m.petugas)=upper(n.petugas) group by n.petugas
  ) select coalesce(jsonb_agg(to_jsonb(t) order by t.petugas),'[]'::jsonb) into result from totals t;
  return result;
end;
$$;

revoke all on function public.receipt_history_is_admin(),public.save_receipt_history(jsonb),
 public.record_receipt_reprint(uuid,uuid,timestamptz),public.list_receipt_history(date,text,int,int,uuid,text),
 public.get_receipt_snapshot(uuid),public.admin_receipt_monthly_summary(date) from public,anon;
grant execute on function public.receipt_history_is_admin(),public.save_receipt_history(jsonb),
 public.record_receipt_reprint(uuid,uuid,timestamptz),public.list_receipt_history(date,text,int,int,uuid,text),
 public.get_receipt_snapshot(uuid),public.admin_receipt_monthly_summary(date) to authenticated;
commit;
