import Image from "next/image";
import { Card, PageShell, SectionHeader } from "@/components/ui";
import { getUser } from "@/lib/supabase/server";
import ContactForm from "./ContactForm";

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-[11px] caps-tight text-zinc-400">
      {children}
    </span>
  );
}

const FINANCE_SKILLS = [
  "Valuation",
  "Financial Modeling",
  "Portfolio Theory",
  "Backtesting",
  "ESG & Carbon Analysis",
  "Reading SEC Filings",
];
const TECHNICAL_SKILLS = ["Python", "TypeScript", "React / Next.js", "APIs"];
const TARGET_ROLES = [
  "Asset Management",
  "Green & Sustainable Finance",
  "Environmental Finance",
];

// The few things a visitor should see first, each linking to the page.
const HIGHLIGHTS = [
  {
    href: "/sustainability",
    title: "Sustainable finance",
    text: "A Green Score that grades about 210 companies against their own industry on carbon intensity, toxic releases and climate targets (EPA and Science Based Targets data), a live tracker of a real sustainability fund's holdings, and the carbon intensity of S&P 500 companies from EPA facility data.",
  },
  {
    href: "/paper-trading",
    title: "A trading bot that runs itself",
    text: "Trades a $100,000 paper account every 15 minutes during market hours, scoring about 210 stocks on their latest annual report, price trend and momentum, with every decision and its reason logged.",
  },
  {
    href: "/quant/rule-tester",
    title: "Testing before trusting",
    text: "Machine-learning models trained on 10 years of S&P 500 data lost to simple trend and momentum rules. The results, and why, are on the site.",
  },
  {
    href: "/quant/diffusion",
    title: "How fast news is priced in",
    text: "More than 13,000 SEC filings timed to the minute: for big companies, about 70% of an earnings-day move happens in the first minute of trading.",
  },
  {
    href: "/research?tab=growth",
    title: "Growth stock screen",
    text: "Every S&P 500 company checked against the growth-investing rules William O'Neil popularized: fast, steady profit growth, high return on equity, accelerating sales, an industry leader on a healthy chart. Usually only a handful pass.",
  },
  {
    href: "/research",
    title: "Stock research",
    text: "Look up any stock: 17 ratios from its latest 10-K, price charts, industry charts for about 210 stocks, and a live market-news feed.",
  },
];
const COURSEWORK = [
  "Intro to Financial Reporting",
  "Coding with Python",
  "Intro to Machine Learning",
  "Accounting",
];

// The contact form lives here too (it used to be its own /contact page,
// which now redirects to #message). ?type=bug|question|opportunity preselects
// the category; a signed-in visitor gets their name and email filled in.
export default async function About({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await getUser();
  const { type } = await searchParams;
  return (
    <PageShell
      eyebrow="about"
      title="Ethan Biancardi"
      subtitle="Bentley University, Finance & Artificial Intelligence"
      description="Double major, expected graduation Spring 2029."
    >
      <section className="mt-4">
        <SectionHeader label="how I got into finance" />
        <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="max-w-2xl space-y-3 text-xs leading-5 text-zinc-400 sm:flex-1">
            <p>
              I got into finance because of my grandfather. He loved the stock
              market and would always talk about how your money could make money
              for you without you having to work for it. When I visited him, he
              would cut out an article from <em>The Wall Street Journal</em> for
              me to read, so I could understand what was happening in the
              market. That sparked my curiosity, and I&apos;ve wanted to learn
              how the markets work ever since. He may not have known it, but he
              also taught me one of the most important lessons in investing:
              your emotions about a stock shouldn&apos;t decide when you buy or
              sell.
            </p>
            <p>
              Trading algorithms were my own idea. The thought of a machine
              making decisions from a clear set of rules fascinates me, and
              it&apos;s the same lesson my grandfather taught me: take the
              emotion out of it.
            </p>
            <p>
              Outside of finance, I love being outdoors and care deeply about
              the environment. That&apos;s what drew me to green and
              environmental finance. It feels like work with a greater purpose.
            </p>
          </div>
          {/* Headshot: public/headshot.jpg, a 480px square crop of the original
            with all camera/location metadata stripped. */}
          <Image
            src="/headshot.jpg"
            alt="Ethan Biancardi"
            width={176}
            height={176}
            priority
            className="order-first mx-auto h-36 w-36 shrink-0 rounded-full border-2 border-border object-cover sm:order-none sm:mx-0 sm:h-44 sm:w-44"
          />
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="why I built this" />
        <div className="mt-2 max-w-2xl space-y-3 text-xs leading-5 text-zinc-400">
          <p>
            I built PRISM because I wanted to learn how a website is made and
            how different trading strategies work. I started with a clear idea
            of what I wanted: a paper trading simulator that could automate
            trading, so I could find out which strategies work best and
            potentially put real money through the same process one day. I did
            not think it would turn out like this. It is not finished yet, and I
            keep adding to it every day.
          </p>
          <p>
            I used AI for most of the coding and for finding data, which ties
            into the other reason I built this. I have always been interested in
            finding ways to incorporate AI into finance, because I think it can
            make people in this industry far more productive. Work that used to
            take an analyst hours, like reading through a 10-K or tracking news
            across a whole portfolio, can now take minutes. On PRISM, AI
            summarizes 10-K filings, flags risks buried inside them, argues a
            stock from six different investor viewpoints, and scans for new laws
            and world events that could affect a company. That frees up time for
            the parts of the job that still need a person: judgment, conviction,
            and the final decision.
          </p>
          <p>
            Building it also pulled me toward the part of finance I care about
            most: where money and the environment meet. PRISM now has a
            sustainability section that grades companies against their own
            industry on carbon, toxic releases and climate targets, and tracks a
            real sustainability fund against the market. That is the work I want
            to do: asset management with an environmental lens.
          </p>
          <p>
            The biggest thing I have learned is that AI works best as a research
            assistant, not a decision maker. Every AI result on the site shows
            its source and the date it came from, and anywhere a plain formula
            does the job, like a DCF or a Sharpe ratio, I used the formula
            instead.
          </p>
          <p>
            The other lesson is to test an idea before trusting it. My
            machine-learning stock model lost to simple trend and momentum
            rules, and a strict growth-stock checklist from a book I was reading
            looked great on paper but would have left the portfolio mostly in
            cash. Both results are on the site, including the ones that
            didn&apos;t work.
          </p>
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader
          label="what I've built"
          description="The highlights. Click one to see it working."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map((h) => (
            <Card key={h.href} href={h.href} interactive padding="sm">
              <p className="relative text-xs font-semibold text-foreground">
                {h.title} →
              </p>
              <p className="relative mt-1 text-[11px] leading-5 text-zinc-500">
                {h.text}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader
          label="what I'm looking for"
          description="Summer finance internships."
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TARGET_ROLES.map((role) => (
            <Tag key={role}>{role}</Tag>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="skills" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card padding="sm">
            <h3 className="text-[10px] caps text-zinc-500">Finance</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FINANCE_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
          <Card padding="sm">
            <h3 className="text-[10px] caps text-zinc-500">Technical</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TECHNICAL_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="coursework & experience" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {COURSEWORK.map((course) => (
            <Tag key={course}>{course}</Tag>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="contact" />
        <div className="mt-3 space-y-1.5 text-xs">
          <p>
            <span className="text-zinc-500">Email: </span>
            <a
              href="mailto:ethanbiancardi@gmail.com"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              ethanbiancardi@gmail.com
            </a>
          </p>
          <p>
            <span className="text-zinc-500">School Email: </span>
            <a
              href="mailto:ebiancardi@falcon.bentley.edu"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              ebiancardi@falcon.bentley.edu
            </a>
          </p>
          <p>
            <span className="text-zinc-500">GitHub: </span>
            <a
              href="https://github.com/ethanbiancardi-prog"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              github.com/ethanbiancardi-prog
            </a>
          </p>
          <p>
            <span className="text-zinc-500">LinkedIn: </span>
            <a
              href="https://www.linkedin.com/in/ethan-biancardi"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              linkedin.com/in/ethan-biancardi
            </a>
          </p>
        </div>
      </section>

      <section id="message" className="mt-4 scroll-mt-20">
        <SectionHeader
          label="send me a message"
          description="Found a bug, have a question about how something works, or want to talk about an opportunity? It lands straight in my inbox."
        />
        <ContactForm
          defaultName={String(user?.user_metadata?.full_name ?? "")}
          defaultEmail={user?.email ?? ""}
          defaultCategory={type}
        />
      </section>

      <section className="mt-4">
        <SectionHeader label="resume" />
        <a
          href="/resume.docx"
          download
          className="mt-3 inline-block text-xs text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
        >
          Download Resume (.docx) →
        </a>
      </section>
    </PageShell>
  );
}
