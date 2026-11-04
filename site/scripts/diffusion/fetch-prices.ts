// Information diffusion, step 2 of 3: prices around every 8-K, into
// site/.ml-cache/diffusion/ (gitignored; rerunnable, resumes where it stopped).
//
//   daily.json       daily closes since a few weeks before START for every
//                    company plus SPY (the market benchmark), dividends and
//                    splits adjusted, from Alpaca's consolidated (SIP) feed
//   min/DATE.json    minute-by-minute closes for each reaction session (see
//                    sessions.ts): the stocks with news that day, plus SPY
//
// Minute requests are grouped by date (one request covers every stock with
// news that day), so ~1,300 requests rather than one per filing. Alpaca's free
// plan allows 200 a minute; this stays under it.
//
// Usage, from site/:  npx tsx --env-file=.env.local scripts/diffusion/fetch-prices.ts   (~10 minutes)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { alpacaData } from "../../src/lib/alpaca";
import { getDailyBars } from "../../src/lib/marketdata";
import { RESEARCH_UNIVERSE } from "../../src/lib/researchUniverse";
import { OUT, START, type FilingEvent } from "./fetch-events";
import { CLOSE, nyParts, OPEN, reactionSession } from "./sessions";

export type Daily = Record<string, [string, number][]>; // symbol -> [date, close]
export type Minutes = Record<string, [number, number][]>; // symbol -> [NY minute of day, close]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function minuteBars(day: string, symbols: string[]): Promise<Minutes> {
  const out: Minutes = {};
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      symbols: symbols.join(","),
      timeframe: "1Min",
      // Wide enough for 9:30-16:00 New York in both summer and winter time.
      start: `${day}T13:00:00Z`,
      end: `${day}T21:30:00Z`,
      feed: "sip",
      adjustment: "all",
      limit: "10000",
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    const page = await alpacaData(`/stocks/bars?${params}`);
    for (const [sym, bars] of Object.entries(page.bars ?? {}) as [string, { t: string; c: number }[]][]) {
      for (const b of bars) {
        const { minute } = nyParts(b.t);
        if (minute < OPEN || minute >= CLOSE) continue; // regular session only
        (out[sym] ??= []).push([minute, b.c]);
      }
    }
    pageToken = page.next_page_token ?? undefined;
  } while (pageToken);
  return out;
}

async function main() {
  mkdirSync(`${OUT}/min`, { recursive: true });
  const events: FilingEvent[] = JSON.parse(readFileSync(`${OUT}/events.json`, "utf8"));

  // Daily closes, from ~2 months before START so every event has a baseline
  // and a pre-news window.
  const dailyFile = `${OUT}/daily.json`;
  if (!existsSync(dailyFile)) {
    const from = new Date(`${START}T00:00:00Z`);
    from.setUTCMonth(from.getUTCMonth() - 2);
    const bars = await getDailyBars(["SPY", ...RESEARCH_UNIVERSE], 0, { start: from.toISOString().slice(0, 10), feed: "sip", adjustment: "all" });
    const daily: Daily = {};
    for (const [sym, b] of bars) daily[sym] = b.map((x) => [x.t.slice(0, 10), x.c]);
    writeFileSync(dailyFile, JSON.stringify(daily));
    console.log(`daily.json: ${Object.keys(daily).length} symbols`);
  }
  const daily: Daily = JSON.parse(readFileSync(dailyFile, "utf8"));
  const calendar = daily.SPY.map(([d]) => d);

  // Which stocks need minutes on which day.
  const byDay = new Map<string, Set<string>>();
  for (const e of events) {
    const s = reactionSession(e.accepted, calendar);
    if (!s) continue; // filed after the last day we have prices for
    (byDay.get(s.day) ?? byDay.set(s.day, new Set()).get(s.day)!).add(e.ticker);
  }
  const days = [...byDay.keys()].sort().filter((d) => !existsSync(`${OUT}/min/${d}.json`));
  console.log(`${byDay.size} reaction sessions, ${days.length} still to fetch`);

  let done = 0;
  for (const day of days) {
    const symbols = ["SPY", ...byDay.get(day)!];
    for (let attempt = 1; ; attempt++) {
      try {
        writeFileSync(`${OUT}/min/${day}.json`, JSON.stringify(await minuteBars(day, symbols)));
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
        await sleep(5000 * attempt); // rate limit or a blip: back off and retry
      }
    }
    if (++done % 100 === 0) console.log(`  ${done}/${days.length}`);
    await sleep(320); // ~190 requests a minute, under Alpaca's 200
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
