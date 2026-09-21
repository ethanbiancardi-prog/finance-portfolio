// Finance jargon that shows up in AI-written research text. When "Explain
// simply" is on, JargonText wraps these in a tooltip so a reader can hover
// any word they don't know. Definitions are one plain sentence each.
export const JARGON = {
  ebit: { term: "EBIT / operating income", definition: "Profit from running the business, before interest on debt and taxes. The cleanest measure of how well the core business works." },
  margin: { term: "Margin", definition: "Profit as a share of revenue. A 20% margin means the company keeps 20 cents of every dollar it sells." },
  grossMargin: { term: "Gross margin", definition: "Revenue minus the direct cost of making the product, as a share of revenue. What is left to pay for everything else." },
  fcf: { term: "Free cash flow", definition: "Cash the business generates after paying for the equipment and buildings it needs. What is actually available for dividends, buybacks, or paying down debt." },
  ocf: { term: "Operating cash flow", definition: "Cash that came in from running the business, before spending on new equipment. Unlike profit, it cannot be dressed up by accounting choices." },
  roic: { term: "ROIC", definition: "Return on invested capital: profit earned per dollar of money tied up in the business. Above roughly 10% usually means the company creates value as it grows." },
  roe: { term: "ROE", definition: "Return on equity: profit per dollar shareholders have invested. High is good, but it can be inflated by borrowing." },
  pe: { term: "P/E multiple", definition: "Share price divided by earnings per share: how many years of profit you are paying for. 28x means you pay $28 for each $1 of annual profit." },
  multiple: { term: "Multiple / re-rating", definition: "How much investors pay per dollar of earnings or sales. A re-rating is when that price changes because the market's view of the company shifts, not because profits did." },
  leverage: { term: "Leverage", definition: "How much the company runs on borrowed money. More debt magnifies both gains and losses." },
  coverage: { term: "Interest coverage", definition: "How many times over profits could pay the year's interest bill. Below about 2x, lenders get nervous." },
  nwc: { term: "Working capital", definition: "Money tied up in day-to-day operations: inventory and unpaid customer bills, minus what the company owes suppliers." },
  capex: { term: "Capex", definition: "Capital expenditure: money spent on long-lived things like factories, stores, and equipment." },
  da: { term: "D&A", definition: "Depreciation and amortization: the accounting charge that spreads the cost of equipment over the years it is used. It reduces profit but is not cash going out the door." },
  wacc: { term: "WACC", definition: "The return investors demand for a company's risk, blending what its lenders and shareholders expect. Used to discount future cash back to today." },
  dcf: { term: "DCF", definition: "Discounted cash flow: estimating what a company is worth today by projecting the cash it will produce and discounting it back for time and risk." },
  guidance: { term: "Guidance", definition: "A company's own forecast for its coming results. Raising or cutting guidance often moves the stock more than the actual results do." },
  consensus: { term: "Consensus", definition: "The average of what Wall Street analysts expect. Beating consensus means doing better than that average forecast." },
  buyback: { term: "Buyback", definition: "The company buying its own shares. Fewer shares means each remaining share owns a bigger slice of the profits." },
  dilution: { term: "Dilution", definition: "New shares being issued, so each existing share owns a smaller slice of the company." },
  runRate: { term: "Run rate", definition: "Taking a recent period and extending it to a full year, e.g. a quarter's sales times four." },
  priceIn: { term: "Priced in", definition: "Already reflected in the share price. If good news is priced in, the stock may not rise when it happens." },
  tailwind: { term: "Tailwind / headwind", definition: "An outside force helping (tailwind) or hurting (headwind) the business, like interest rates or a commodity price." },
  drawdown: { term: "Drawdown", definition: "How far a price has fallen from its peak. A 30% drawdown means the stock is 30% below its high." },
  volatility: { term: "Volatility", definition: "How much a price bounces around. High volatility means big swings in both directions." },
  beta: { term: "Beta", definition: "How much a stock moves when the overall market moves. Beta 1.5 means it tends to move 1.5% for every 1% the market does." },
  momentum: { term: "Momentum", definition: "The tendency of a rising stock to keep rising for a while: a trend, not a fundamental." },
  starter: { term: "Starter position", definition: "A small first purchase, a few percent of the account, that you can add to as your confidence grows." },
  invalidation: { term: "Invalidation", definition: "The specific thing that would prove an idea wrong. Deciding it in advance stops you from rationalising a losing position." },
  moat: { term: "Moat", definition: "A durable advantage that keeps competitors out: a brand, a network, a patent, or costs nobody else can match." },
  secular: { term: "Secular", definition: "A long-term trend that plays out over years regardless of the economic cycle." },
  yoy: { term: "Year over year", definition: "This period compared with the same period a year earlier, the fair way to compare a seasonal business." },
  basisPoints: { term: "Basis points", definition: "Hundredths of a percent. 25 basis points = 0.25%." },
  fomc: { term: "Fed / FOMC", definition: "The Federal Reserve's rate-setting committee. Higher rates make borrowing dearer and future profits worth less today." },
  yield: { term: "Yield", definition: "Annual income as a share of price: a bond paying $4 on $100 yields 4%." },
  spread: { term: "Spread", definition: "The gap between two rates or prices, e.g. what a bank earns on loans minus what it pays on deposits." },
} as const;

export type JargonKey = keyof typeof JARGON;

// Match patterns, most specific first so "free cash flow" wins over "cash
// flow" and "gross margin" over "margin". Each is tried against the text in
// order; earlier matches are protected from later patterns.
export const JARGON_PATTERNS: [RegExp, JargonKey][] = [
  [/\bfree cash flow\b|\bFCF\b/gi, "fcf"],
  [/\boperating cash flow\b|\bcash from operations\b/gi, "ocf"],
  [/\bgross margins?\b/gi, "grossMargin"],
  [/\boperating (income|profit)\b|\bEBIT\b/g, "ebit"],
  [/\b(operating|net|profit) margins?\b|\bmargins?\b/gi, "margin"],
  [/\bROIC\b|\breturn on invested capital\b/gi, "roic"],
  [/\bROE\b|\breturn on equity\b/gi, "roe"],
  [/\bP\/E\b|\bprice[- ]to[- ]earnings\b|\btrailing earnings\b/gi, "pe"],
  [/\bre-?rat(e|es|ed|ing)\b|\bmultiples?\b/gi, "multiple"],
  [/\bleveraged?\b|\bdebt-to-equity\b/gi, "leverage"],
  [/\binterest coverage\b|\bcoverage\b/gi, "coverage"],
  [/\bworking capital\b/gi, "nwc"],
  [/\bcapex\b|\bcapital expenditures?\b/gi, "capex"],
  [/\bD&A\b|\bdepreciation\b/g, "da"],
  [/\bWACC\b|\bcost of capital\b/gi, "wacc"],
  [/\bDCF\b|\bdiscounted cash flow\b/gi, "dcf"],
  [/\bguidance\b/gi, "guidance"],
  [/\bconsensus\b/gi, "consensus"],
  [/\bbuybacks?\b|\bshare repurchases?\b/gi, "buyback"],
  [/\bdilut(ion|ive|ed)\b/gi, "dilution"],
  [/\brun[- ]rate\b/gi, "runRate"],
  [/\bpriced[- ]in\b|\bprices? in\b/gi, "priceIn"],
  [/\b(tail|head)winds?\b/gi, "tailwind"],
  [/\bdrawdowns?\b/gi, "drawdown"],
  [/\bvolatil(e|ity)\b/gi, "volatility"],
  [/\bbeta\b/gi, "beta"],
  [/\bmomentum\b/gi, "momentum"],
  [/\bstarter (position|size)\b/gi, "starter"],
  [/\binvalidation\b/gi, "invalidation"],
  [/\bmoat\b/gi, "moat"],
  [/\bsecular\b/gi, "secular"],
  [/\byear[- ]over[- ]year\b|\by\/y\b|\bYoY\b/gi, "yoy"],
  [/\bbasis points?\b|\bbps\b/gi, "basisPoints"],
  [/\bFOMC\b|\bthe Fed\b|\bFederal Reserve\b/g, "fomc"],
  [/\byields?\b/gi, "yield"],
  [/\bspreads?\b/gi, "spread"],
];

// Split text into plain segments and jargon hits, for rendering.
export type JargonSegment = { text: string; key?: JargonKey };

export function splitJargon(text: string): JargonSegment[] {
  // Mark hits on a character map so later (broader) patterns can't overlap
  // earlier (more specific) ones.
  const owner: (JargonKey | null)[] = new Array(text.length).fill(null);
  for (const [re, key] of JARGON_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (owner.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) owner[i] = key;
    }
  }
  const segments: JargonSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const key = owner[i];
    let j = i;
    while (j < text.length && owner[j] === key) j++;
    segments.push(key ? { text: text.slice(i, j), key } : { text: text.slice(i, j) });
    i = j;
  }
  return segments;
}
