-- Calibration Tracker (/calibration): predictions logged with my own
-- probability next to what a market was pricing, scored once they resolve.
--
-- Run this in the Supabase SQL Editor (see docs/DATA_AND_ENV.md).
--
-- The one rule that matters: a prediction is a record of what I thought at
-- the time. So the database itself, not just the page, enforces:
--   - the question, both probabilities, the source, the dates and the
--     reasoning can never change after the row is written;
--   - the only change allowed is resolving it (outcome null -> yes/no), once;
--   - a resolved prediction can't be changed or deleted, ever.
-- An open prediction can still be deleted (to fix a typo, re-log it).

create table if not exists public.prediction_logs (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users (id) on delete cascade,
  question                    text not null check (length(question) between 1 and 300),
  -- Probabilities as decimals, 0.62 = 62%.
  my_probability              numeric(5, 4) not null check (my_probability between 0 and 1),
  market_probability_at_entry numeric(5, 4) not null check (market_probability_at_entry between 0 and 1),
  market_source               text not null check (length(market_source) between 1 and 100),
  entry_date                  date not null default current_date,
  resolution_date             date not null, -- when I expect it to resolve
  outcome                     boolean, -- null = open; true = happened; false = didn't
  resolved_at                 timestamptz,
  reasoning                   text not null check (length(reasoning) between 1 and 280),
  created_at                  timestamptz not null default now(),
  -- outcome and resolved_at are set together or not at all.
  check ((outcome is null) = (resolved_at is null))
);

-- Every query is "my predictions, newest first".
create index if not exists prediction_logs_user_entry_idx
  on public.prediction_logs (user_id, entry_date desc, created_at desc);


-- ---------------------------------------------------------------------------
-- Lock-in trigger
-- ---------------------------------------------------------------------------
-- RLS decides *whose* rows you can touch; this decides *what* may change.
create or replace function public.prediction_logs_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.outcome is not null then
      raise exception 'A resolved prediction cannot be deleted.';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.outcome is not null then
    raise exception 'A resolved prediction cannot be edited.';
  end if;
  if new.outcome is null then
    raise exception 'The only allowed change is resolving the prediction.';
  end if;
  if (new.user_id, new.question, new.my_probability, new.market_probability_at_entry,
      new.market_source, new.entry_date, new.resolution_date, new.reasoning, new.created_at)
     is distinct from
     (old.user_id, old.question, old.my_probability, old.market_probability_at_entry,
      old.market_source, old.entry_date, old.resolution_date, old.reasoning, old.created_at) then
    raise exception 'Only the outcome can be set; the prediction itself is locked.';
  end if;
  new.resolved_at := now(); -- the server's clock, not the browser's
  return new;
end;
$$;

drop trigger if exists prediction_logs_lock on public.prediction_logs;
create trigger prediction_logs_lock
  before update or delete on public.prediction_logs
  for each row execute function public.prediction_logs_lock();


-- ---------------------------------------------------------------------------
-- Row Level Security: each user sees and writes only their own rows.
-- (select auth.uid()) is evaluated once per query instead of once per row.
-- ---------------------------------------------------------------------------
alter table public.prediction_logs enable row level security;

create policy "Users can read their own predictions"
  on public.prediction_logs for select to authenticated
  using ((select auth.uid()) = user_id);

-- New rows must be yours and must start open.
create policy "Users can log their own predictions"
  on public.prediction_logs for insert to authenticated
  with check ((select auth.uid()) = user_id and outcome is null and resolved_at is null);

-- Resolving is an update; the trigger above limits it to the outcome.
create policy "Users can resolve their own predictions"
  on public.prediction_logs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Deleting is allowed only while open (the trigger refuses resolved rows).
create policy "Users can delete their own open predictions"
  on public.prediction_logs for delete to authenticated
  using ((select auth.uid()) = user_id and outcome is null);
