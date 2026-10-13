-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- One row per user holds the whole app state as JSON. Row-level security means a
-- signed-in user can only ever see and change their own row; the anonymous role
-- (anyone on the internet holding the public anon key) can touch nothing.

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

revoke all on public.app_state from anon;

create policy "owner can read"
  on public.app_state for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "owner can insert"
  on public.app_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "owner can update"
  on public.app_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
