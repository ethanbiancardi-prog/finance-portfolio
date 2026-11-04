// The research list: what Industry Charts on /research (and the
// /sustainability fund tracker) draw. About 230 stocks in 12 sectors.
//
// It is deliberately NOT lib/sectors.ts. That ~94-stock list is what the live
// bots trade and test (Signal Trader, Momentum rotation, Strategy Lab,
// Research Signals), so growing the research page must not change what they
// buy. This list is built FROM it: every bot sector keeps all its stocks here,
// plus extras, so a stock the bots hold always has a chart.
//
// Every symbol was checked trading on Nov 4 2026 (Coterra, AvalonBay and
// Equity Residential had stopped, so they're not here). Same rules as sectors.ts: plain letters-only symbols Alpaca accepts
// (no BRK.B) that file 10-Ks with the SEC (no foreign ADRs like TSM or ASML),
// so the Search tab can open any of them. Pure data, safe for the browser.
import { SECTORS, type SectorKey } from "./sectors";

export type ResearchSector = { label: string; description: string; tickers: string[] };

type Spec = {
  label: string;
  description: string;
  base?: SectorKey; // start from this bot sector's stocks
  drop?: string[]; // ...minus these (they get their own research sector)
  add?: string[];
};

// The chip stocks and the materials stocks get sectors of their own here,
// so Technology and Industrials don't each carry a second industry.
const CHIPS = ["NVDA", "AVGO", "AMD", "INTC", "QCOM"];
const MATERIALS = ["LIN", "FCX", "NUE"];

const SPECS = {
  communications: {
    label: "Communications",
    description: "Internet platforms, streaming, telecom, advertising, and games.",
    base: "communications",
    // Warner Bros. Discovery stopped trading on Oct 5 2026; it's still in
    // the bots' sectors.ts, but a dead line doesn't belong on the chart.
    drop: ["WBD"],
    add: ["CHTR", "LYV", "OMC", "PINS", "SNAP", "MTCH", "FOXA", "TTD"],
  },
  consumer: {
    label: "Consumer",
    description: "Retail, restaurants, travel, cars, apparel, and household staples.",
    base: "consumer",
    add: ["TSLA", "BKNG", "TJX", "CMG", "MDLZ", "PM", "CL", "MAR"],
  },
  energy: {
    label: "Energy",
    description: "Oil and gas producers, refiners, services, and pipelines.",
    base: "energy",
    add: ["WMB", "OKE", "BKR", "FANG", "EXE", "TRGP", "EQT", "APA"],
  },
  financials: {
    label: "Financials",
    description: "Banks, payment networks, insurers, exchanges, and asset managers.",
    base: "financials",
    add: ["SPGI", "PGR", "CB", "ICE", "CME", "PNC", "KKR", "USB"],
  },
  healthcare: {
    label: "Healthcare",
    description: "Pharma, biotech, insurers, devices, and hospitals.",
    base: "healthcare",
    add: ["BMY", "VRTX", "REGN", "SYK", "BSX", "MDT", "DHR", "ELV"],
  },
  industrials: {
    label: "Industrials",
    description: "Machinery, aerospace and defense, transport, and electrical equipment.",
    base: "industrials",
    drop: MATERIALS,
    add: ["ETN", "WM", "ITW", "EMR", "GD", "NOC", "CSX", "FDX", "PH", "UBER", "GEV"],
  },
  materials: {
    label: "Materials",
    description: "Chemicals, industrial gases, metals and mining, and building materials.",
    add: [...MATERIALS, "SHW", "APD", "ECL", "NEM", "DOW", "DD", "PPG", "VMC", "MLM", "CTVA", "IFF", "ALB"],
  },
  realEstate: {
    label: "Real Estate",
    description: "REITs: warehouses, cell towers, data centers, housing, and healthcare property.",
    add: ["PLD", "AMT", "EQIX", "WELL", "SPG", "O", "PSA", "DLR", "CCI", "VICI", "EXR", "ESS", "MAA", "IRM", "CBRE"],
  },
  semiconductors: {
    label: "Semiconductors",
    description: "Chip designers, manufacturers, and the equipment makers behind them.",
    add: [...CHIPS, "MU", "TXN", "ADI", "LRCX", "KLAC", "AMAT", "MRVL", "NXPI", "ON", "MCHP", "MPWR", "TER"],
  },
  sustainability: {
    label: SECTORS.sustainability.label,
    description: SECTORS.sustainability.description,
    base: "sustainability",
  },
  technology: {
    label: "Technology",
    description: "Software, cloud, cybersecurity, and hardware.",
    base: "technology",
    drop: CHIPS,
    add: ["NOW", "IBM", "INTU", "PANW", "CRWD", "ACN", "ANET", "DELL", "ADSK", "FTNT", "CDNS", "SNPS", "HPQ"],
  },
  utilities: {
    label: "Utilities",
    description: "Electric, gas, and power-generation companies.",
    add: ["NEE", "SO", "DUK", "CEG", "AEP", "SRE", "D", "EXC", "XEL", "PCG", "ED", "PEG", "VST", "WEC", "ETR"],
  },
} satisfies Record<string, Spec>;

export type ResearchSectorKey = keyof typeof SPECS;
export const RESEARCH_SECTOR_KEYS = Object.keys(SPECS) as ResearchSectorKey[];

export const RESEARCH_SECTORS = Object.fromEntries(
  RESEARCH_SECTOR_KEYS.map((k) => {
    const s: Spec = SPECS[k];
    const base = s.base ? SECTORS[s.base].tickers.filter((t) => !s.drop?.includes(t)) : [];
    return [k, { label: s.label, description: s.description, tickers: [...new Set([...base, ...(s.add ?? [])])] }];
  }),
) as Record<ResearchSectorKey, ResearchSector>;

// Every stock on the research page, once.
export const RESEARCH_UNIVERSE: string[] = [...new Set(RESEARCH_SECTOR_KEYS.flatMap((k) => RESEARCH_SECTORS[k].tickers))];
