-- Paper portfolio step 2: placing trades.
--
-- Run this in the Supabase SQL Editor (paste the contents of this file, not
-- its path).
--
-- Trades go through this one function, called only by the server (with the
-- secret key) after it has looked up the live price itself. Doing the checks
-- in Postgres rather than in the API route matters for one reason: two
-- orders submitted at the same moment. Checked in the app, both could read
-- "$10,000 cash available" before either is saved, and both would go
-- through. Here, `for update` locks the user's account row, so the second
-- order waits until the first is committed and then sees the reduced cash.

create or replace function public.place_paper_trade(
  p_user_id uuid,
  p_symbol  text,
  p_side    text,
  p_qty     numeric,
  p_price   numeric
)
returns public.paper_trades
language plpgsql
set search_path = ''
as $$
declare
  v_starting numeric;
  v_cash     numeric;
  v_held     numeric;
  v_trade    public.paper_trades;
begin
  select starting_cash into v_starting
  from public.paper_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'no paper account for this user';
  end if;

  if p_side = 'buy' then
    select v_starting - coalesce(sum(case when side = 'buy' then qty * price else -qty * price end), 0)
    into v_cash
    from public.paper_trades
    where user_id = p_user_id;

    if p_qty * p_price > v_cash then
      raise exception 'insufficient cash: % available', round(v_cash, 2);
    end if;
  else
    select coalesce(sum(case when side = 'buy' then qty else -qty end), 0)
    into v_held
    from public.paper_trades
    where user_id = p_user_id and symbol = p_symbol;

    if p_qty > v_held then
      raise exception 'insufficient shares: % held', v_held;
    end if;
  end if;

  insert into public.paper_trades (user_id, symbol, side, qty, price)
  values (p_user_id, p_symbol, p_side, p_qty, p_price)
  returning * into v_trade;

  return v_trade;
end;
$$;

-- Nobody but the server may call it. Without this, any signed-in user could
-- call it from the browser with a price of their choosing.
revoke execute on function public.place_paper_trade(uuid, text, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.place_paper_trade(uuid, text, text, numeric, numeric)
  to service_role;
