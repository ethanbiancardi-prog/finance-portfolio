# Finance + AI Portfolio

Personal portfolio site showcasing finance projects built with AI — by a Bentley University
student double-majoring in Finance and Artificial Intelligence.

## The pitch
Most finance students have a resume. This portfolio shows *working tools* that combine
financial modeling fundamentals with modern AI — exactly the intersection employers are
hiring for right now.

## Repo structure

```
finance-portfolio/
├── README.md               ← you are here
├── docs/
│   ├── PROJECT_IDEAS.md    ← full idea backlog with difficulty ratings
│   ├── ROADMAP.md          ← suggested build order (semester-friendly)
│   └── TECH_STACK.md       ← recommended tools & why
├── site/                   ← the portfolio website itself (landing page, about, project cards)
├── projects/
│   ├── paper-trading/      ← AI-assisted paper trading simulator
│   ├── dcf-builder/        ← interactive DCF valuation tool
│   ├── statement-analyzer/ ← upload a 10-K, get AI analysis
│   └── client-work/        ← write-ups + screenshots of small-business sites you built
└── shared/                 ← shared components, styles, utilities
```

## Working with Claude Code on this repo
- Keep a `CLAUDE.md` file at the repo root (see `docs/TECH_STACK.md`). Claude Code reads it
  automatically at the start of each session, so it "remembers" your conventions, stack,
  and goals even across sessions.
- Build one project at a time. Each `projects/*` folder is self-contained so a broken
  experiment never takes down the rest of the portfolio.
- Commit early and often — a public GitHub with a real commit history is itself a
  portfolio artifact recruiters look at.
