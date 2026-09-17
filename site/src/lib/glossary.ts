import { NOTES } from "@/app/quant-notes/notes";

// Hover definitions for finance terms used as labels around the site. Where
// a Quant Note covers the term, the definition is the note's own one-line
// body and the entry links to the full note — so the tooltip and the note
// never say different things. Terms without a note get a short definition
// written here.
export type GlossaryEntry = { term: string; definition: string; noteSlug?: string };

function fromNote(slug: string, term: string, definition?: string): GlossaryEntry {
  const note = NOTES.find((n) => n.slug === slug);
  if (!note) throw new Error(`glossary: no quant note with slug "${slug}"`);
  return { term, definition: definition ?? note.body, noteSlug: slug };
}

export const GLOSSARY = {
  sharpe: fromNote("sharpe-ratio", "Sharpe ratio"),
  drawdown: fromNote("max-drawdown", "Max drawdown"),
  beta: fromNote(
    "beta-capm",
    "Beta vs SPY",
    "How much the account tends to move for every 1% move in the S&P 500 (SPY). Beta of 1 means it swings with the market; 0.5 means half as much; near 0 means its moves aren't tied to the market at all.",
  ),
  volatility: fromNote(
    "sharpe-ratio",
    "Volatility (annualized)",
    "How much the account's daily returns bounce around, scaled to a yearly figure. 15% means a typical year sees swings of roughly that size; higher means a rougher ride. It's the risk measure Sharpe divides by.",
  ),
  momentum: fromNote("momentum", "Momentum score"),
  equity: {
    term: "Equity",
    definition:
      "Total account value right now: cash plus the current market value of every open position. This is the number the equity curve tracks.",
  },
  buyingPower: {
    term: "Buying power",
    definition:
      "How much you can spend on new positions right now. It can be larger than your cash because a margin account lets you borrow against the value of what you already hold.",
  },
  pnl: {
    term: "P&L",
    definition:
      "Profit and loss on an open position: current value minus what you paid. Unrealized until you sell — it can still change.",
  },
  avgEntry: {
    term: "Average entry",
    definition:
      "The average price paid per share across every buy that built this position. Compare it to the current price to see whether the position is up or down.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
