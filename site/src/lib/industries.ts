// Shared types and pure helpers for the Industry Charts tab on /research.
// No server imports, so the client page can read them too; the fetching and
// caching live in lib/industriesData.ts.

export const PERIODS = {
  "1m": { label: "1M" },
  "3m": { label: "3M" },
  "6m": { label: "6M" },
  ytd: { label: "YTD" },
  "1y": { label: "1Y" },
  "5y": { label: "5Y" },
} as const;

export type PeriodKey = keyof typeof PERIODS;
export const PERIOD_KEYS = Object.keys(PERIODS) as PeriodKey[];

export function isPeriodKey(key: string): key is PeriodKey {
  return key in PERIODS;
}

// One period's prices for every stock in lib/sectors.ts plus SPY, already
// turned into returns: series[symbol][i] is the % change (0.12 = +12%) from
// the period's starting close to dates[i]. null where a stock has no price
// that day.
export type IndustryData = {
  period: PeriodKey;
  dates: string[]; // YYYY-MM-DD
  series: Record<string, (number | null)[]>;
  names: Record<string, string>;
  asOf: string; // when the prices were fetched (ISO)
  lastBar: string; // the latest trading day in the data (YYYY-MM-DD)
};

// Equal-weight average of several stocks' returns on each date: what you'd
// have made putting the same dollars into each at the start of the period.
// Dates where no stock has a price stay null.
export function averageSeries(series: (number | null)[][]): (number | null)[] {
  if (series.length === 0) return [];
  return series[0].map((_, i) => {
    let sum = 0;
    let n = 0;
    for (const s of series) {
      const v = s[i];
      if (v != null) {
        sum += v;
        n++;
      }
    }
    return n ? sum / n : null;
  });
}

// The last non-null value: a stock's return over the whole period.
export function lastValue(series: (number | null)[] | undefined): number | null {
  if (!series) return null;
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}
