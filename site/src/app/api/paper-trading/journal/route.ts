import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

// Flat JSON file instead of a database — fine for one user's local journal,
// not for a deployed multi-request environment (no locking, no persistence
// on read-only serverless filesystems).
const JOURNAL_PATH = path.join(process.cwd(), "data", "journal.json");

type JournalEntry = {
  id: string;
  date: string;
  ticker: string;
  action: "buy" | "sell";
  thesis: string;
  exitCondition: string;
};

async function readJournal(): Promise<JournalEntry[]> {
  const raw = await readFile(JOURNAL_PATH, "utf-8");
  return JSON.parse(raw);
}

export async function GET() {
  const entries = await readJournal();
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const { date, ticker, action, thesis, exitCondition } = await request.json();

  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    date,
    ticker: ticker.toUpperCase(),
    action,
    thesis,
    exitCondition,
  };

  const entries = await readJournal();
  entries.unshift(entry);
  await writeFile(JOURNAL_PATH, JSON.stringify(entries, null, 2));

  return NextResponse.json(entry);
}
