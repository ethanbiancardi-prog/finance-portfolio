-- Strategies step 2: running them automatically.
--
-- Run this in the Supabase SQL Editor (paste the contents of this file, not
-- its path).

-- The on/off switch, and what the nightly check last decided. The user may
-- flip `active` themselves (RLS update policy from 0004); the last_* columns
-- are written by the server.
alter table public.paper_strategies
  add column if not exists active             boolean not null default false,
  add column if not exists activated_at       timestamptz,
  -- Null means "rebalance at the next check": set when the strategy is
  -- turned on or its targets change.
  add column if not exists last_rebalanced_at timestamptz,
  add column if not exists last_checked_at    timestamptz,
  add column if not exists last_check_note    text;

-- One row per rebalance (or failed attempt), so users can see what their
-- strategy did and why. Days where nothing was due only update
-- last_check_note above instead of adding a row.
create table if not exists public.paper_strategy_runs (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.paper_accounts (user_id) on delete cascade,
  ran_at  timestamptz not null default now(),
  status  text not null check (status in ('rebalanced', 'error')),
  reason  text not null,
  -- [{"symbol": "SPY", "side": "sell", "qty": 3, "price": 661.2}, ...]
  orders  jsonb not null default '[]'
);

create index if not exists paper_strategy_runs_user_time_idx
  on public.paper_strategy_runs (user_id, ran_at desc);

alter table public.paper_strategy_runs enable row level security;

create policy "Users can read their own strategy runs"
  on public.paper_strategy_runs for select to authenticated
  using (auth.uid() = user_id);

-- No write policy: only the nightly job (secret key) records runs, so the
-- log is a true record of what the strategy did.
