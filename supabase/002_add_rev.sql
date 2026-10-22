-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.
--
-- Adds a version number ("rev") to your data row that goes up by one on every save,
-- whoever saves (the website on any device, or Claude through the MCP server).
-- Writers check the version they read, so one can never silently overwrite the
-- other: if the version changed, the writer re-reads and merges first.

alter table public.app_state
  add column if not exists rev bigint not null default 1;

create or replace function public.app_state_bump_rev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rev := old.rev + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_state_bump_rev on public.app_state;

create trigger app_state_bump_rev
  before update on public.app_state
  for each row execute function public.app_state_bump_rev();
