# Data sources, caching, cron, environment, local setup

## Data sources

| Source | Used for | Cost | Notes |
|---|---|---|---|
| **Alpaca (paper trading API)** | Account, positions, orders, equity history, quotes, daily bars, asset search, since-trade performance | Free | Paper account only — no real money touches this repo. Keys: `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY`. Wrapper: `lib/alpaca.ts`, `lib/marketdata.ts` |
| **SEC EDGAR** | Company/ticker resolution, XBRL company facts, 17 financial ratios, 10-K filing text, SIC descriptions | Free | No key. Public JSON + filing archives. `lib/edgar.ts`. Be polite with request volume |
| **Anthropic API** | Business summaries, catalyst playbooks, six-persona panel, red-flag scan, "Say it simply", AI signals | **Paid** | `ANTHROPIC_API_KEY`, read implicitly by `new Anthropic()`. claude-opus-5 with `web_search_20260209` for the AI signals |
| **Yahoo Finance RSS** | Headlines, merged with Alpaca news | Free | `lib/news.ts` |
| **US House Clerk** | House periodic transaction reports (PTRs), official PDFs | Free | Parsed with `pdf-parse`. Scanned/paper filings skipped |
| **efdsearch.senate.gov** | Senate PTRs | Free | Accept the access agreement for a session cookie, then the DataTables search endpoint (`lib/signals/senate.ts`) |
| **open-cabinet.org** | CSV extraction of the President's OGE 278-T filings | Free | Public-domain filings; **credit + link required**, research use only. One volunteer maintainer — expect outages |
| **congress-legislators dataset** | Committee memberships for the oversight-overlap flag | Free, public domain | `lib/signals/committees.ts` |

## The caching rule

**Never call a paid or scraped API on page load.** Every external fetch is
either cached in Redis by a scheduled job or explicitly user-triggered.

- `/api/signals` serves the Redis cache only. It never calls upstream or the model.
- Refreshes happen in `/api/cron/daily` or via the secret-gated
  `/api/signals/refresh`.
- Redis is Upstash, provisioned through Vercel's KV product. It injects
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` rather than the `UPSTASH_*` names
  `Redis.fromEnv()` expects, so `lib/kv.ts` builds the client explicitly and
  lazily. Use `getRedis()` and guard with `kvConfigured()`.

### Current TTLs

| Key / feature | TTL |
|---|---|
| `api/research/summary` — business summary | 90 days (a filing's summary does not go stale) |
| `api/research/playbook` — catalysts & actions | 3 hours |
| `api/research/simplify` — plain rewrite, keyed by text hash | 7 days |
| `signals:political`, `signals:presidential`, `signals:legislation`, `signals:geopolitics`, `signals:financial` | Refreshed daily; cache persists if a refresh fails |
| Alpaca asset list (in-memory, per instance) | 1 hour |

`api/research/analysis` (the six-persona panel) is **not** cached and takes
~30s. Streaming it in is the next planned improvement.

## Cron budget — this is a real constraint

Vercel's free tier allows **two cron jobs per project**, and both are taken
(`site/vercel.json`):

| Path | Schedule | Does |
|---|---|---|
| `/api/rotation/run` | `0 15 1 * *` — monthly, 1st | Executes the rebalance. Trades with no human in the loop |
| `/api/cron/daily` | `0 22 * * 1-5` — weekdays 22:00 UTC | Regime check + political + presidential + legislation + geopolitics + financial refreshes |

**Add new daily jobs inside `api/cron/daily`, never as a third cron.** That
route sets `maxDuration = 300` (needs Fluid Compute) because the AI refreshes
spend 1-2 minutes web searching. Each job is isolated — a failure is reported,
not propagated, and leaves the previous day's cache in place.

## Environment variables (names only — never commit or print values)

Local values live in `site/.env.local`, which is gitignored. Production values
live in the Vercel project settings.

**Required**
- `ANTHROPIC_API_KEY` — read implicitly by `new Anthropic()`; not referenced via `process.env` anywhere
- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `CRON_SECRET` — bearer token for `/api/rotation/run`, `/api/rotation/check`, `/api/signals/refresh`

**Auto-provisioned by the Vercel KV integration** (present but not read by app code)
- `KV_URL`
- `KV_REST_API_READ_ONLY_TOKEN`
- `REDIS_URL`
- `VERCEL_OIDC_TOKEN`

**Optional**
- `CLIENT_WORK_PASSCODE` — overrides the client-work passcode
- `CLIENT_WORK_SECRET` — HMAC salt for the session cookie
- `SIGNALS_DEBUG` — verbose logging from the AI signal refreshes

> **Security note, unresolved.** Neither `CLIENT_WORK_PASSCODE` nor
> `CLIENT_WORK_SECRET` is set in `site/.env.local` or in Vercel, so
> `/client-work` currently falls back to the defaults hard-coded in
> `lib/clientWorkAuth.ts` — in a public GitHub repo. Setting
> `CLIENT_WORK_PASSCODE` in Vercel fixes it without a code change.
> `/client-work` is Gemini Antigravity's area (see CLAUDE.md), so raise this
> with Ethan rather than editing those files.

## Local setup

```
cd site
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
```

`site/.env.local` must exist before `npm run dev` or the Alpaca, Anthropic and
Redis features will fail. **Restart the dev server after any change to
`.env.local`** — Next.js reads it at startup only.

## Deploy

Push to `main` on `github.com/ethanbiancardi-prog/finance-portfolio` → Vercel
auto-deploys to production. There is no manual deploy step.

- Vercel project: `site` (team `ethanbiancardi-5348s-projects`)
- Vercel root directory: `site/`
- Live: https://site-theta-drab-22.vercel.app
- Framework preset Next.js, Node 24.x
- Preview deployments have SSO protection enabled; the production alias is public

## Windows gotchas already solved

- **Run Claude Code from PowerShell, not Git Bash.** Git Bash has caused tool
  and path problems in this project; PowerShell is the working setup.
- **The project is nested:** `finance-portfolio/finance-portfolio/`. The outer
  folder is not the repo. Git root and `CLAUDE.md` are in the inner one; the app
  is one level further down in `site/`. Three levels, easy to get wrong.
- **Restart the dev server after editing `.env.local`.**
- If port 3000 is stuck:
  `Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess`
  then `Stop-Process -Id <pid> -Force`.
- `scripts/screenshots.js` needs `playwright-core` resolvable on `NODE_PATH`.

## Note on repo copies

There are several `finance-portfolio` folders on this machine. The working copy
is `C:\Users\ethan\Downloads\finance-portfolio\finance-portfolio` — it has
`.vercel/` and `.claude/` and is the one linked to Vercel.
`C:\Users\ethan\.gemini\antigravity\scratch\finance-portfolio` is Gemini
Antigravity's clone of the same GitHub repo. The copies under
`C:\Users\ethan\dev\` and `C:\Users\ethan\OneDrive\` are not git repos. Confirm
you are in the Downloads copy before editing.
