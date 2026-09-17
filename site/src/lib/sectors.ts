// The sector universe, hand-picked. Pure data with no server imports so the
// client-side pages (research Browse tab, rotation dashboard) can read it too.
//
// These used to come from SEC EDGAR by SIC code, sorted by public float —
// which produced lists full of names nobody recognises (holding companies,
// REIT wrappers, the 30th-largest regional bank). A curated list of
// household names is more useful for research and makes the rotation
// strategy's picks legible: "top 2 in Energy" should mean XOM vs CVX, not
// two mid-cap drillers.
//
// Every ticker here must be a plain common-stock symbol Alpaca accepts
// (letters only — so BRK.B is out) and must exist in SEC's ticker file so the
// research page can find its 10-K.

export type Sector = { label: string; tickers: string[] };

export const SECTORS = {
  communications: {
    label: "Communications",
    tickers: ["GOOGL", "META", "NFLX", "DIS", "CMCSA", "TMUS", "VZ", "T", "SPOT", "WBD", "TTWO", "RBLX"],
  },
  consumer: {
    label: "Consumer",
    tickers: ["AMZN", "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "PG", "KO", "PEP"],
  },
  energy: {
    label: "Energy",
    tickers: ["XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "MPC", "VLO", "KMI", "DVN", "HAL"],
  },
  financials: {
    label: "Financials",
    tickers: ["JPM", "BAC", "WFC", "GS", "MS", "C", "V", "MA", "AXP", "BLK", "SCHW", "COF"],
  },
  healthcare: {
    label: "Healthcare",
    tickers: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "PFE", "TMO", "ABT", "AMGN", "ISRG", "GILD", "CVS"],
  },
  industrials: {
    label: "Materials & Industrials",
    tickers: ["CAT", "DE", "HON", "GE", "LMT", "RTX", "BA", "UNP", "UPS", "LIN", "FCX", "NUE"],
  },
  // "Sustainability" isn't a GICS sector, so this is a judgement call:
  // renewables, EVs, clean utilities, water, waste, and battery materials.
  sustainability: {
    label: "Sustainability",
    tickers: ["TSLA", "NEE", "FSLR", "ENPH", "RIVN", "BEP", "AWK", "WM", "ALB", "CEG", "PLUG"],
  },
  technology: {
    label: "Technology",
    tickers: ["AAPL", "MSFT", "NVDA", "AVGO", "AMD", "ORCL", "CRM", "ADBE", "INTC", "CSCO", "QCOM", "PLTR"],
  },
} as const satisfies Record<string, Sector>;

export type SectorKey = keyof typeof SECTORS;

// Display order — same as the object above, spelled out so it's stable even
// if someone reorders the keys.
export const SECTOR_KEYS = Object.keys(SECTORS) as SectorKey[];

export function isSectorKey(key: string): key is SectorKey {
  return key in SECTORS;
}
