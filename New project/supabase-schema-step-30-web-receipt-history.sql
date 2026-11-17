begin;

create table if not exists public.monitoring_receipt_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.save_receipt_history(p_snapshot jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  owner_id uuid;
  owner_email text;
  owner_petugas text;
  existing public.monitoring_receipt_history%rowtype;
  receipt_id uuid := (p_snapshot->>'id')::uuid;
begin
  select profile.user_id, profile.email, profile.petugas
    into owner_id, owner_email, owner_petugas
  from public.monitoring_profiles profile
  where profile.user_id = auth.uid();

  if owner_id is null then
    select operator.user_id, operator.email, split_part(operator.email, '@', 1)
      into owner_id, owner_email, owner_petugas
    from public.monitoring_receipt_operators operator
    where operator.user_id = auth.uid();
  end if;

  if owner_id is null then raise exception 'Sesi pengguna tidak valid'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or octet_length(p_snapshot::text) > 65536
    or receipt_id is null or coalesce(p_snapshot->>'print_text', '') = ''
    or coalesce(p_snapshot->>'idpel', '') !~ '^[0-9]{1,30}$'
    or coalesce(p_snapshot->>'transaction_id', '') = '' or coalesce(p_snapshot->>'reference', '') = ''
    or coalesce(p_snapshot->>'customer_name', '') = ''
    or (p_snapshot->>'format_version')::int <> 1
    or (p_snapshot->>'printed_at')::timestamptz is null or (p_snapshot->>'sent_at')::timestamptz is null
    or (p_snapshot->>'printed_at')::timestamptz > now() + interval '1 day'
    or (p_snapshot->>'sent_at')::timestamptz > now() + interval '1 day'
    or (p_snapshot ? 'web_receipt' and jsonb_typeof(p_snapshot->'web_receipt') <> 'object')
  then raise exception 'Snapshot struk tidak valid'; end if;

  insert into public.monitoring_receipt_history
    (id,user_id,username,petugas,printed_at,sent_at,transaction_id,reference,idpel,customer_name,
     base_amount,extra_amount,admin_amount,total_amount,snapshot)
  values (receipt_id,owner_id,upper(split_part(owner_email,'@',1)),
    upper(coalesce(nullif(btrim(owner_petugas),''),split_part(owner_email,'@',1))),
    (p_snapshot->>'printed_at')::timestamptz,(p_snapshot->>'sent_at')::timestamptz,
    p_snapshot->>'transaction_id',p_snapshot->>'reference',p_snapshot->>'idpel',p_snapshot->>'customer_name',
    (p_snapshot->>'base_amount')::bigint,(p_snapshot->>'extra_amount')::bigint,
    (p_snapshot->>'admin_amount')::bigint,(p_snapshot->>'total_amount')::bigint,p_snapshot)
  on conflict (id) do nothing;

  select * into existing from public.monitoring_receipt_history where id = receipt_id;
  if existing.user_id <> owner_id or existing.snapshot <> p_snapshot then
    raise exception 'ID struk sudah dipakai dengan data berbeda';
  end if;
end;
$$;

revoke all on function public.save_receipt_history(jsonb) from public, anon;
grant execute on function public.save_receipt_history(jsonb) to authenticated;

commit;
