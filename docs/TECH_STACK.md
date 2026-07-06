# Tech Stack Recommendations

## Keep it simple — the finance thinking is the product, not the framework

- **Site + tools:** Next.js (React) — one framework covers the portfolio site and every
  interactive tool. Huge ecosystem, free Vercel hosting, and Claude Code is very fluent in it.
- **Charts:** Recharts (easy) or lightweight-charts by TradingView (for the paper-trading candles)
- **Styling:** Tailwind CSS
- **Data/backend where needed:** Next.js API routes; Python (FastAPI) only if you want
  yfinance/pandas for heavier analysis
- **Database (paper trading needs one):** Supabase or SQLite to start
- **AI:** Anthropic API (see https://docs.claude.com/en/api/overview)
- **Hosting:** Vercel (free tier is plenty)

## CLAUDE.md template (put this at your repo root)

```markdown
# CLAUDE.md

## Project
Finance + AI portfolio for a Bentley University student (Finance major, AI secondary major).
Goal: land finance/fintech internships by showcasing working tools.

## Stack
Next.js + Tailwind + Recharts. Python/FastAPI only for heavy analysis. Deployed on Vercel.

## Conventions
- Each project lives in projects/<name>, self-contained
- Prefer simple, readable code over clever code — I'm learning
- Explain financial formulas in comments (I want to be able to defend every line in an interview)
- Mobile-friendly is required
- Never commit API keys; use .env.local

## Current focus
(update this each session — e.g., "building DCF sensitivity table")
```

Claude Code reads CLAUDE.md automatically at the start of each session — this is how you
give it persistent "memory" of the project across sessions and reboots.
Docs: https://docs.claude.com/en/docs/claude-code/overview
