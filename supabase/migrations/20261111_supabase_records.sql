create table if not exists public.app_records (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id),
  check (length(collection) between 1 and 64),
  check (length(id) between 1 and 128),
  check (jsonb_typeof(data) = 'object')
);

create index if not exists app_records_collection_idx
  on public.app_records (collection);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    join public.app_records as admin_record
      on admin_record.collection = 'admins'
      and (
        admin_record.id in (auth_user.id::text, lower(auth_user.email))
        or lower(coalesce(admin_record.data ->> 'email', '')) = lower(auth_user.email)
      )
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and coalesce((admin_record.data ->> 'active')::boolean, false)
  );
$$;

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    join public.app_records as admin_record
      on admin_record.collection = 'admins'
      and (
        admin_record.id in (auth_user.id::text, lower(auth_user.email))
        or lower(coalesce(admin_record.data ->> 'email', '')) = lower(auth_user.email)
      )
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and coalesce((admin_record.data ->> 'active')::boolean, false)
      and admin_record.data ->> 'role' = 'owner'
  );
$$;

alter table public.app_records enable row level security;

revoke all on public.app_records from anon, authenticated;
grant select on public.app_records to authenticated;

drop policy if exists "Admins can read application records" on public.app_records;
create policy "Admins can read application records"
  on public.app_records
  for select
  to authenticated
  using (public.is_app_admin());

create or replace function public.resolve_app_timestamps(value jsonb, stamp timestamptz)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value = '{"__supabaseServerTimestamp": true}'::jsonb then
    return to_jsonb(stamp);
  elsif jsonb_typeof(value) = 'object' then
    return coalesce(
      (
        select jsonb_object_agg(key, public.resolve_app_timestamps(entry, stamp))
        from jsonb_each(value) as fields(key, entry)
      ),
      '{}'::jsonb
    );
  elsif jsonb_typeof(value) = 'array' then
    return coalesce(
      (
        select jsonb_agg(public.resolve_app_timestamps(entry, stamp) order by position)
        from jsonb_array_elements(value) with ordinality as items(entry, position)
      ),
      '[]'::jsonb
    );
  end if;
  return value;
end;
$$;

revoke all on function public.resolve_app_timestamps(jsonb, timestamptz)
  from public, anon, authenticated;

create or replace function public.apply_record_batch(
  p_reads jsonb default '[]'::jsonb,
  p_operations jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  read_entry jsonb;
  operation jsonb;
  lock_entry record;
  current_revision bigint;
  record_exists boolean;
  operation_kind text;
  collection_name text;
  record_id text;
  record_data jsonb;
begin
  if auth.role() <> 'service_role' and not public.is_app_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_reads) <> 'array' or jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Invalid transaction payload' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_reads) as entry(value)
    where jsonb_typeof(value) <> 'object'
      or value ->> 'collection' is null
      or length(value ->> 'collection') not between 1 and 64
      or value ->> 'id' is null
      or length(value ->> 'id') not between 1 and 128
      or not (value ? 'revision')
  ) then
    raise exception 'Invalid transaction read set' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) as entry(value)
    where jsonb_typeof(value) <> 'object'
      or value ->> 'operation' is null
      or value ->> 'operation' not in ('set', 'update', 'delete')
      or value ->> 'collection' is null
      or length(value ->> 'collection') not between 1 and 64
      or value ->> 'id' is null
      or length(value ->> 'id') not between 1 and 128
      or (
        value ->> 'operation' <> 'delete'
        and jsonb_typeof(coalesce(value -> 'data', '{}'::jsonb)) <> 'object'
      )
  ) then
    raise exception 'Invalid transaction operations' using errcode = '22023';
  end if;

  for lock_entry in
    select distinct entries.value ->> 'collection' as collection_name,
                    entries.value ->> 'id' as record_id
    from (
      select value from jsonb_array_elements(p_reads)
      union all
      select value from jsonb_array_elements(p_operations)
    ) as entries
    order by collection_name, record_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(lock_entry.collection_name || ':' || lock_entry.record_id, 781245610)
    );
  end loop;

  for read_entry in
    select value
    from jsonb_array_elements(p_reads)
    order by value ->> 'collection', value ->> 'id'
  loop
    collection_name := read_entry ->> 'collection';
    record_id := read_entry ->> 'id';
    select revision into current_revision
      from public.app_records
      where collection = collection_name and id = record_id;
    record_exists := found;

    if read_entry -> 'revision' = 'null'::jsonb then
      if record_exists then
        raise exception 'Transaction conflict' using errcode = '40001';
      end if;
    elsif not record_exists
      or current_revision <> (read_entry ->> 'revision')::bigint then
      raise exception 'Transaction conflict' using errcode = '40001';
    end if;
  end loop;

  for operation in select value from jsonb_array_elements(p_operations)
  loop
    operation_kind := operation ->> 'operation';
    collection_name := operation ->> 'collection';
    record_id := operation ->> 'id';
    record_data := public.resolve_app_timestamps(
      coalesce(operation -> 'data', '{}'::jsonb),
      transaction_timestamp()
    );

    if collection_name is null or length(collection_name) not between 1 and 64
      or record_id is null or length(record_id) not between 1 and 128 then
      raise exception 'Invalid record key' using errcode = '22023';
    end if;

    if collection_name = 'admins'
      and auth.role() <> 'service_role'
      and not public.is_app_owner() then
      raise exception 'Only an owner can manage administrators' using errcode = '42501';
    end if;

    if operation_kind = 'delete' then
      delete from public.app_records
        where collection = collection_name and id = record_id;
    elsif operation_kind = 'set' then
      insert into public.app_records (collection, id, data)
      values (collection_name, record_id, record_data)
      on conflict (collection, id) do update
        set data = case
              when coalesce((operation ->> 'merge')::boolean, false)
                then public.app_records.data || excluded.data
              else excluded.data
            end,
            revision = public.app_records.revision + 1,
            updated_at = now();
    elsif operation_kind = 'update' then
      update public.app_records
        set data = data || record_data,
            revision = revision + 1,
            updated_at = now()
        where collection = collection_name and id = record_id;
      if not found then
        raise exception 'Record does not exist: %/%', collection_name, record_id
          using errcode = 'P0002';
      end if;
    else
      raise exception 'Unsupported record operation' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function public.apply_record_batch(jsonb, jsonb) from public, anon;
grant execute on function public.apply_record_batch(jsonb, jsonb) to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.app_records;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication is unavailable; enable Realtime for app_records in the Supabase dashboard.';
end;
$$;
