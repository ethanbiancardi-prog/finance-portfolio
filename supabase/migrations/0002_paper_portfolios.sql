-- Per-user paper portfolios: every account gets its own simulated $100,000,
-- separate from the site's single Alpaca paper account.
--
-- Run this in the Supabase SQL Editor (paste the contents of this file, not
-- its path).
--
-- Cash and positions are not stored. They are derived from the trade list:
-- cash = starting cash - buys + sells, and a position is the net quantity per
-- symbol. One source of truth means the two can never disagree.

create table if not exists public.paper_accounts (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  starting_cash numeric(14, 2) not null default 100000,
  created_at    timestamptz not null default now()
);

create table if not exists public.paper_trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.paper_accounts (user_id) on delete cascade,
  symbol      text not null,
  side        text not null check (side in ('buy', 'sell')),
  qty         numeric(18, 6) not null check (qty > 0),
  -- The fill price. Always looked up by the server at trade time, never
  -- taken from the browser; see the note on writes below.
  price       numeric(14, 4) not null check (price > 0),
  executed_at timestamptz not null default now()
);

create index if not exists paper_trades_user_time_idx
  on public.paper_trades (user_id, executed_at);


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.paper_accounts enable row level security;
alter table public.paper_trades enable row level security;

create policy "Users can read their own paper account"
  on public.paper_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Users open their own account, and the policy pins the amount: an insert
-- claiming any starting cash other than $100,000 is refused by the database,
-- even if someone calls Supabase directly with the public key. There is no
-- update policy, so the amount cannot be changed afterwards either. The
-- opening time is pinned to "now" as well, so an account can't be backdated
-- to a day SPY happened to be low.
create policy "Users can open their own paper account with $100,000"
  on public.paper_accounts
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and starting_cash = 100000
    and created_at between now() - interval '1 minute' and now() + interval '1 minute'
  );

create policy "Users can read their own paper trades"
  on public.paper_trades
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Deliberately no insert, update or delete policy on paper_trades. A trade
-- carries a price, and anything the browser can write, the browser can lie
-- about: with an insert policy, anyone could record buying NVDA at $1. Trades
-- are written only by the server, which looks the price up itself.
