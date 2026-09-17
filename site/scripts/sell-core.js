// One-time helper for switching to the Momentum + Leverage strategy: sells the
// old passive-core ETFs (and any other position the strategy doesn't manage)
// so the next rebalance has the cash it needs. See STRATEGY.md "Switching
// over from the old strategy".
//
// Usage, from site/:
//   node scripts/sell-core.js            # dry run — lists what it WOULD sell
//   node scripts/sell-core.js --execute  # places market sell orders (paper)
//
// Reads Alpaca keys from .env.local. Positions recorded by the strategy
// itself (in Redis) are left alone.
const fs = require("fs");

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const headers = {
  "APCA-API-KEY-ID": env.APCA_API_KEY_ID,
  "APCA-API-SECRET-KEY": env.APCA_API_SECRET_KEY,
  "Content-Type": "application/json",
};
const execute = process.argv.includes("--execute");

(async () => {
  const { Redis } = require("@upstash/redis");
  const redis = new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN });
  const last = await redis.get("rotation:last-rebalance");
  const managed = new Set((last?.positions ?? []).map((p) => p.symbol));

  const positions = await (await fetch("https://paper-api.alpaca.markets/v2/positions", { headers })).json();
  const toSell = positions.filter((p) => !managed.has(p.symbol));

  console.log(`${toSell.length} positions outside the strategy (${managed.size} managed ones left alone):`);
  let total = 0;
  for (const p of toSell) {
    total += Number(p.market_value);
    console.log(`  ${p.symbol.padEnd(6)} ${p.qty.padStart(6)} sh  $${Number(p.market_value).toFixed(0).padStart(7)}`);
  }
  console.log(`  total ≈ $${total.toFixed(0)}`);

  if (!execute) {
    console.log("\nDry run. Re-run with --execute to place the sell orders.");
    return;
  }
  for (const p of toSell) {
    const res = await fetch("https://paper-api.alpaca.markets/v2/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ symbol: p.symbol, qty: p.qty, side: "sell", type: "market", time_in_force: "day" }),
    });
    const body = await res.json();
    console.log(res.ok ? `  sold ${p.symbol} (${body.status})` : `  FAILED ${p.symbol}: ${body.message ?? res.status}`);
  }
  console.log("\nDone. Orders fill at the next market open if placed after hours. Then run the rebalance.");
})();
