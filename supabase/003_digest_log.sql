-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to run more than once.
--
-- One row per day for the morning email digest: it stops the digest from being sent twice, lets a failed
-- send be retried, and records what happened (sent, failed and why, or missed). It is separate from
-- app_state, so the digest never writes to your planner data.
--
-- Row-level security is ON with no policies, and anon/authenticated are revoked. Only the server-side
-- service-role key (used by the digest function) can read or write it. The website cannot see this table.

create table if not exists public.digest_log (
  sent_on    date        primary key,
  status     text        not null check (status in ('sending', 'sent', 'failed')),
  attempts   integer     not null default 1,
  detail     text,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.digest_log enable row level security;

revoke all on public.digest_log from anon, authenticated;

-- Make sure the server-side service role can use what the digest needs (newer Supabase projects don't always
-- grant new tables to it automatically). It reads your planner record and reads/writes the log, nothing else.
grant select, insert, update on public.digest_log to service_role;
grant select on public.app_state to service_role;
