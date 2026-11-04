import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Callout } from "@/components/ui";
import { FUND_NAME, FUND_TICKERS, FUND_URL } from "@/lib/sustainabilityFund";
import CarbonExplorer from "./CarbonExplorer";
import FundTracker from "./FundTracker";
import Orbit from "./Orbit";

export const metadata: Metadata = {
  title: "Sustainable Finance",
  description: "ESG fund tracking and S&P 500 carbon intensity from EPA data, by Ethan Biancardi.",
};

// The page has its own look (the .eco theme in globals.css): every UI-kit
// component inside the wrapper reads green tokens instead of the site's.
const SECTIONS = [
  { id: "fund", n: "01", label: "Fund tracker" },
  { id: "carbon", n: "02", label: "Carbon intensity" },
  { id: "method", n: "03", label: "Method" },
];

// Headline numbers from the carbon dataset, read once at build time (the
// page is static, so this never runs per visit).
async function carbonFacts() {
  try {
    const raw = await readFile(path.join(process.cwd(), "public/data/carbon.json"), "utf8");
    const d = JSON.parse(raw) as { years: number[]; companies: { emissions: Record<string, number> }[] };
    const y = d.years[d.years.length - 1];
    const tons = d.companies.reduce((s, c) => s + (c.emissions[y] ?? 0), 0);
    return { companies: d.companies.length, year: y, first: d.years[0], tons };
  } catch {
    return null;
  }
}

export default async function SustainabilityPage() {
  const facts = await carbonFacts();
  const kpis = [
    { value: String(FUND_TICKERS.length), label: "fund holdings tracked live" },
    { value: facts ? String(facts.companies) : "N/A", label: "S&P 500 emitters scored" },
    { value: facts ? `${(facts.tons / 1e9).toFixed(2)}B t` : "N/A", label: `CO₂e released in ${facts?.year ?? "2023"}` },
    { value: facts ? `${facts.first}–${facts.year}` : "N/A", label: "EPA reporting years" },
  ];

  return (
    <div className="eco relative flex flex-1 flex-col">
      <div className="eco-backdrop relative flex flex-1 flex-col">
        <main className="page-enter relative flex w-full flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-10">
          {/* Hero */}
          <section className="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <p className="flex items-center gap-2 text-[11px] caps-wide text-accent">
                <span className="eco-live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                sustainable finance
              </p>
              <h1 className="eco-gradient-text mt-3 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
                Where capital
                <br />
                meets carbon.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Two lenses on the same question: does investing with environmental, social and governance (ESG) screens cost
                anything, and who would pay if carbon had a price? Live prices for the {FUND_NAME}&apos;s holdings, and the
                EPA&apos;s facility-by-facility emissions for the S&P 500.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border sm:grid-cols-4">
                {kpis.map((k) => (
                  <div key={k.label} className="bg-panel px-3 py-3 backdrop-blur">
                    <p className="text-xl tabular-nums text-foreground sm:text-2xl">{k.value}</p>
                    <p className="mt-0.5 text-[10px] caps text-zinc-500">{k.label}</p>
                  </div>
                ))}
              </div>

              <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-2">
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="group flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-foreground transition-colors hover:border-accent hover:text-accent"
                  >
                    <span className="tabular-nums text-[10px] text-accent">{s.n}</span>
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
            <div className="flex justify-center">
              <Orbit tickers={FUND_TICKERS} />
            </div>
          </section>

          {/* 01 Fund tracker */}
          <section id="fund" className="mt-14 scroll-mt-20">
            <SectionTitle n="01" title="The fund, live">
              The{" "}
              <a href={FUND_URL} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                {FUND_NAME}
              </a>{" "}
              (Bentley Investment Group) doesn&apos;t buy only clean-energy stocks. It screens every industry for companies leading on
              environmental, social and governance measures, so its holdings run from Google to a waste hauler to a gold royalty company.
            </SectionTitle>
            <div className="mt-4">
              <FundTracker />
            </div>
          </section>

          {/* 02 Carbon */}
          <section id="carbon" className="mt-14 scroll-mt-20">
            <SectionTitle n="02" title="Carbon intensity">
              How much greenhouse gas S&amp;P 500 companies&apos; US facilities release for every $1 million of sales. It&apos;s the
              number sustainability funds screen on, and it shows who would be hit hardest if carbon ever had a price.
            </SectionTitle>
            <CarbonExplorer />
          </section>

          {/* 03 Method */}
          <section id="method" className="mt-14 scroll-mt-20">
            <SectionTitle n="03" title="How it works">
              Where every number on this page comes from.
            </SectionTitle>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Callout label="fund basket">
                Each holding&apos;s % return from the period&apos;s first close, dividends included, averaged with equal weights. The
                fund&apos;s real position sizes aren&apos;t public, so this is a stand-in for it. It also uses today&apos;s holdings for the
                whole period, so the longer periods flatter it: the fund picked these names with hindsight.
              </Callout>
              <Callout label="carbon intensity">
                Tons of CO₂-equivalent from a company&apos;s large US facilities ÷ (its revenue ÷ $1M). EPA&apos;s Greenhouse Gas
                Reporting Program, with each facility split by ownership share. Direct (Scope 1) emissions only.
              </Callout>
              <Callout label="data & refresh">
                Prices: Alpaca market data, cached 10 minutes, live trades every minute while the market is open. Emissions: EPA
                data built offline into a static file. No AI on this page. Educational, not investment advice.
              </Callout>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SectionTitle({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="tabular-nums text-xs text-accent eco-glow-text">{n}</span>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">{children}</p>
        <span aria-hidden className="mt-3 block h-px w-full max-w-2xl bg-gradient-to-r from-accent via-[var(--eco-cyan)] to-transparent opacity-60" />
      </div>
    </div>
  );
}
