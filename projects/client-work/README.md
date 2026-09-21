# Client Work Case Studies

This section documents client websites, portals, and software tools built for small businesses.

## Structure
- Live at `/client-work`, linked from Project 08 on the portfolio homepage.
- **Passcode Protected**: Restricted by default so client case studies, deliverables, and confidential metrics are only accessible to authorized viewers (Ethan and prospective clients).
- Passcode is set via the environment variable `CLIENT_WORK_PASSCODE` in `.env.local` (local) and Vercel Project Settings (production).
- Authentication sets an `httpOnly` secure session cookie (`client_work_session`) valid for 30 days.

## Case Studies Data
- Case study data lives in `site/src/data/clientWork.ts`.
- Each case study specifies:
  - Client name, industry, timeline, role
  - High-level summary & tags
  - The Problem: Business challenge and pain points
  - What Shipped: Architecture overview and implementation highlights
  - Measurable Impact: Key metrics (conversion %, hours saved, latency)
  - Key Learnings & Takeaways
