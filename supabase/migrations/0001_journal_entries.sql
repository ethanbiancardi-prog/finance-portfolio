-- Trade journal, moved off site/data/journal.json so entries belong to a
-- person rather than to a file on the server.
--
-- Run this in the Supabase SQL Editor (see docs/DATA_AND_ENV.md).

create table if not exists public.journal_entries (
  id            uuid primary key default gen_random_uuid(),

  -- The owner. references auth.users means a row cannot exist for a user who
  -- does not exist, and on delete cascade means deleting an account takes its
  -- journal with it rather than leaving orphaned rows behind.
  user_id       uuid not null references auth.users (id) on delete cascade,

  date          date not null,
  ticker        text not null,
  company_name  text,
  action        text not null check (action in ('buy', 'sell')),
  thesis        text not null,
  exit_condition text not null,
  created_at    timestamptz not null default now()
);

-- Every query is "my entries, newest first", so index exactly that.
create index if not exists journal_entries_user_date_idx
  on public.journal_entries (user_id, date desc, created_at desc);


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Without RLS, anyone holding the publishable key could ask for every row in
-- this table, because that key is in the browser and is not a secret. RLS
-- moves the check into Postgres itself: the database refuses to return rows
-- that fail the policy, no matter what the query asked for.
--
-- The app cannot opt out of this, and neither can a bug in the app. That is
-- the point: the guarantee does not depend on remembering to write
-- "where user_id = ..." in every query.

alter table public.journal_entries enable row level security;

-- auth.uid() is the id of the user making the request, read from the JWT that
-- Supabase verifies on arrival. Signed out, it is null, and every policy below
-- fails, so an anonymous request sees nothing at all.

-- READ: you only ever see rows you own.
create policy "Users can read their own journal entries"
  on public.journal_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

-- CREATE: you may only create rows that belong to you.
-- with check runs against the row being written, so this blocks inserting a
-- row stamped with somebody else's user_id.
create policy "Users can create their own journal entries"
  on public.journal_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- UPDATE needs both halves:
--   using      - which existing rows you are allowed to touch
--   with check - what the row is allowed to look like afterwards
-- Without the with check you could edit your own row and reassign it to
-- another user on the way out.
create policy "Users can update their own journal entries"
  on public.journal_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: only your own rows.
create policy "Users can delete their own journal entries"
  on public.journal_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Note there is no policy for the anon role. With RLS on, no policy means no
-- access, so a signed-out visitor cannot read this table even though their
-- browser holds a valid publishable key.
