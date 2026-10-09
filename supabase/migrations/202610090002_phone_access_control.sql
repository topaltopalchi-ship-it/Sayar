-- Owner-managed access for up to six SaySay accounts (owner + five invited users).
-- Before enabling login, insert the owner's verified phone below using E.164 format:
-- insert into public.saysay_access_users(phone, role, enabled)
-- values ('+<OWNER_PHONE_WITH_COUNTRY_CODE>', 'owner', true);
-- Never put service_role keys in the client app.

create table if not exists public.saysay_access_users (
  phone text primary key check (phone ~ '^\\+[1-9][0-9]{7,14}$'),
  role text not null default 'member' check (role in ('owner', 'member')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.saysay_access_users enable row level security;
revoke all on public.saysay_access_users from anon, authenticated;

create or replace function public.saysay_has_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := auth.jwt() ->> 'phone';
  v_role text;
  v_enabled boolean;
  v_count integer;
begin
  if auth.uid() is null or v_phone is null then
    return jsonb_build_object('allowed', false, 'role', null);
  end if;
  select u.role, u.enabled into v_role, v_enabled
    from public.saysay_access_users u where u.phone = v_phone;
  if not found or not v_enabled then
    return jsonb_build_object('allowed', false, 'role', null);
  end if;
  select count(*) into v_count from public.saysay_access_users where enabled;
  return jsonb_build_object('allowed', true, 'role', v_role, 'active_users', v_count, 'max_users', 6);
end;
$$;

create or replace function public.saysay_list_access_users()
returns table(phone text, role text, enabled boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.saysay_access_users u
    where u.phone = (auth.jwt() ->> 'phone') and u.role = 'owner' and u.enabled
  ) then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  return query select u.phone, u.role, u.enabled, u.created_at
    from public.saysay_access_users u order by u.created_at, u.phone;
end;
$$;

create or replace function public.saysay_set_access_user(p_phone text, p_enabled boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(trim(coalesce(p_phone, '')), '[[:space:]()-]', '', 'g');
  v_active_count integer;
  v_existing_role text;
begin
  if not exists (
    select 1 from public.saysay_access_users u
    where u.phone = (auth.jwt() ->> 'phone') and u.role = 'owner' and u.enabled
  ) then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if v_phone !~ '^\\+[1-9][0-9]{7,14}$' then
    raise exception 'phone must use international E.164 format' using errcode = '22023';
  end if;
  select role into v_existing_role from public.saysay_access_users where phone = v_phone;
  if v_existing_role = 'owner' and not p_enabled then
    raise exception 'owner account cannot be disabled' using errcode = '42501';
  end if;
  if p_enabled then
    select count(*) into v_active_count from public.saysay_access_users where enabled;
    if v_existing_role is null and v_active_count >= 6 then
      raise exception 'maximum six enabled users (owner plus five members)' using errcode = '23514';
    end if;
    insert into public.saysay_access_users(phone, role, enabled)
      values (v_phone, 'member', true)
      on conflict (phone) do update set enabled = true;
  else
    update public.saysay_access_users set enabled = false
      where phone = v_phone and role = 'member';
  end if;
  return jsonb_build_object('ok', true, 'phone', v_phone, 'enabled', p_enabled);
end;
$$;

-- Do not allow phone-auth signups unless the phone is pre-approved.
create or replace function public.saysay_guard_auth_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null or not exists (
    select 1 from public.saysay_access_users u
    where u.phone = new.phone and u.enabled
  ) then
    raise exception 'This phone number is not authorized for SaySay' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists saysay_guard_auth_phone on auth.users;
create trigger saysay_guard_auth_phone
  before insert or update of phone on auth.users
  for each row execute function public.saysay_guard_auth_phone();

grant execute on function public.saysay_has_access() to authenticated;\ngrant execute on function public.saysay_phone_is_enabled() to authenticated;
grant execute on function public.saysay_list_access_users() to authenticated;
grant execute on function public.saysay_set_access_user(text, boolean) to authenticated;

create or replace function public.saysay_phone_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1 from public.saysay_access_users u
    where u.phone = (auth.jwt() ->> 'phone') and u.enabled
  );
$;

-- Existing cloud backup rows are accessible only to approved, enabled accounts.
drop policy if exists "users can read own backup" on public.user_backups;
create policy "approved users can read own backup"
  on public.user_backups for select to authenticated
  using (
    (select auth.uid()) = user_id and public.saysay_phone_is_enabled()
  );

drop policy if exists "users can insert own backup" on public.user_backups;
create policy "approved users can insert own backup"
  on public.user_backups for insert to authenticated
  with check (
    (select auth.uid()) = user_id and public.saysay_phone_is_enabled()
  );

drop policy if exists "users can update own backup" on public.user_backups;
create policy "approved users can update own backup"
  on public.user_backups for update to authenticated
  using (
    (select auth.uid()) = user_id and public.saysay_phone_is_enabled()
  )
  with check (
    (select auth.uid()) = user_id and public.saysay_phone_is_enabled()
  );

drop policy if exists "users can delete own backup" on public.user_backups;
create policy "approved users can delete own backup"
  on public.user_backups for delete to authenticated
  using (
    (select auth.uid()) = user_id and public.saysay_phone_is_enabled()
  );
