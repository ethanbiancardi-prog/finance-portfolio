-- Paper portfolio strategies, step 1: saving a strategy.
--
-- Run this in the Supabase SQL Editor (paste the contents of this file, not
-- its path).
--
-- A strategy is a recipe: target weights per ticker plus a rebalance rule.
-- Preset and custom strategies are stored the same way; preset_key only
-- records which preset it started from. One strategy per account.
--
-- Unlike trades, a user may write their own strategy directly: it contains
-- no prices, so there is nothing to lie about. The API validates tickers
-- and weights, and whatever later runs the strategy validates them again
-- rather than trusting this table.

create table if not exists public.paper_strategies (
  user_id    uuid primary key references public.paper_accounts (user_id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  preset_key text,
  -- [{"symbol": "SPY", "weight": 60}, ...]; weights are percentages and may
  -- total less than 100, the rest stays in cash.
  holdings   jsonb not null check (jsonb_typeof(holdings) = 'array'),
  rebalance  text not null check (rebalance in ('monthly', 'weekly', 'drift')),
  -- Only used when rebalance = 'drift': rebalance once any holding is this
  -- many percentage points away from its target.
  drift_pct  numeric(4, 1) check (drift_pct is null or (drift_pct > 0 and drift_pct <= 50)),
  updated_at timestamptz not null default now()
);

alter table public.paper_strategies enable row level security;

create policy "Users can read their own strategy"
  on public.paper_strategies for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own strategy"
  on public.paper_strategies for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own strategy"
  on public.paper_strategies for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own strategy"
  on public.paper_strategies for delete to authenticated
  using (auth.uid() = user_id);
