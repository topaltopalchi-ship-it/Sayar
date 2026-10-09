-- Apply this migration in the Supabase SQL editor before enabling cloud backups.
-- Never use a service_role key in the client application.
create table if not exists public.user_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  schema_version integer not null default 1 check (schema_version = 1),
  updated_at timestamptz not null default now(),
  constraint user_backups_payload_is_object check (jsonb_typeof(payload) = 'object')
);

alter table public.user_backups enable row level security;
revoke all on table public.user_backups from anon;
grant select, insert, update, delete on table public.user_backups to authenticated;

drop policy if exists "users can read own backup" on public.user_backups;
create policy "users can read own backup"
  on public.user_backups for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own backup" on public.user_backups;
create policy "users can insert own backup"
  on public.user_backups for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own backup" on public.user_backups;
create policy "users can update own backup"
  on public.user_backups for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can delete own backup" on public.user_backups;
create policy "users can delete own backup"
  on public.user_backups for delete to authenticated
  using ((select auth.uid()) = user_id);
