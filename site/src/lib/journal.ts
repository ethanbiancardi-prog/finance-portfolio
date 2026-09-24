// Postgres columns are snake_case; the API and the UI have always used
// camelCase. One mapping function, so the rename lives in exactly one place.

export type JournalRow = {
  id: string;
  user_id: string;
  date: string;
  ticker: string;
  company_name: string | null;
  action: "buy" | "sell";
  thesis: string;
  exit_condition: string;
  created_at: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  ticker: string;
  companyName: string | null;
  action: "buy" | "sell";
  thesis: string;
  exitCondition: string;
};

export function rowToEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    ticker: row.ticker,
    companyName: row.company_name,
    action: row.action,
    thesis: row.thesis,
    exitCondition: row.exit_condition,
  };
}
