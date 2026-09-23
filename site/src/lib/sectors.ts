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
// research page can find its 10-K. A ticker may appear in more than one
// sector (Sustainability overlaps several) — the rotation strategy only ever
// picks a stock once, in the first sector where it ranks.

export type Sector = { label: string; description: string; tickers: string[] };

export const SECTORS = {
  communications: {
    label: "Communications",
    description: "Internet platforms, streaming, telecom, and games.",
    tickers: ["GOOGL", "META", "NFLX", "DIS", "CMCSA", "TMUS", "VZ", "T", "SPOT", "WBD", "TTWO", "RBLX"],
  },
  consumer: {
    label: "Consumer",
    description: "Retail, restaurants, apparel, and household staples.",
    tickers: ["AMZN", "WMT", "COST", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "PG", "KO", "PEP"],
  },
  energy: {
    label: "Energy",
    description: "Oil and gas producers, refiners, services, and pipelines.",
    tickers: ["XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "MPC", "VLO", "KMI", "DVN", "HAL"],
  },
  financials: {
    label: "Financials",
    description: "Banks, payment networks, brokers, and asset managers.",
    tickers: ["JPM", "BAC", "WFC", "GS", "MS", "C", "V", "MA", "AXP", "BLK", "SCHW", "COF"],
  },
  healthcare: {
    label: "Healthcare",
    description: "Pharma, biotech, insurers, devices, and diagnostics.",
    tickers: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "PFE", "TMO", "ABT", "AMGN", "ISRG", "GILD", "CVS"],
  },
  industrials: {
    label: "Materials & Industrials",
    description: "Machinery, aerospace and defense, transport, chemicals, and metals.",
    tickers: ["CAT", "DE", "HON", "GE", "LMT", "RTX", "BA", "UNP", "UPS", "LIN", "FCX", "NUE"],
  },
  // Not a GICS sector. This mirrors the holdings of Bentley Investment
  // Group's Sustainability Fund (bentleyinvestmentgroup.org/sustainability,
  // as of Sep 2026): an ESG screen applied across industries — renewable
  // energy, clean tech, resource efficiency, and companies with strong
  // governance and social-responsibility records — rather than a pure
  // clean-energy theme. Grouped by the fund's own sub-sector labels.
  sustainability: {
    label: "Sustainability",
    description:
      "ESG leaders across industries, the current holdings of Bentley Investment Group's Sustainability Fund: renewable energy, clean tech, resource efficiency, and strong governance.",
    tickers: [
      "GOOGL", "META", // interactive media
      "AMAT", "KEYS", // semiconductors, tech hardware
      "AXP", "V", // consumer finance, financial services
      "CI", "ENSG", "DGX", // healthcare services
      "LLY", "GILD", // pharma, biotech
      "KO", "PG", // beverages, household products
      "DOV", // machinery
      "DUK", // electric utilities
      "RSG", // commercial services (waste and recycling)
      "RGLD", // metals and mining
      "SPG", // retail REITs
    ],
  },
  technology: {
    label: "Technology",
    description: "Hardware, semiconductors, cloud, and enterprise software.",
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
