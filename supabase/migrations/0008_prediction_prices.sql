-- Calibration Tracker: the market's price over time for each prediction
-- logged from a Kalshi market, one point per day. Lets the page draw how the
-- crowd's probability moved after you made your call.
--
-- Run this in the Supabase SQL Editor (see docs/DATA_AND_ENV.md).
--
-- Append-only: points are recorded (by the page with your session, and by
-- the daily cron with the server key) and never edited. Deleting an open
-- prediction removes its points with it (on delete cascade).

create table if not exists public.prediction_prices (
  prediction_id uuid not null references public.prediction_logs (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  observed_on   date not null,
  probability   numeric(5, 4) not null check (probability between 0 and 1),
  primary key (prediction_id, observed_on)
);

-- "All my price points" is the page's one query.
create index if not exists prediction_prices_user_idx on public.prediction_prices (user_id);

alter table public.prediction_prices enable row level security;

create policy "Users can read their own price history"
  on public.prediction_prices for select to authenticated
  using ((select auth.uid()) = user_id);

-- A point may only be added for one of your own predictions.
create policy "Users can record prices for their own predictions"
  on public.prediction_prices for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.prediction_logs p
      where p.id = prediction_id and p.user_id = (select auth.uid())
    )
  );

-- No update or delete policies: with RLS on, that means nobody signed in can
-- change or remove a recorded point.
