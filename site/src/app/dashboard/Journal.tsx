"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Field,
  SectionHeader,
  SelectField,
  EmptyRow,
  tableHeadRowClass,
  tableHeadCellClass,
  tableRowClass,
  tableCellClass,
  tableCellStrongClass,
} from "@/components/ui";
import type { JournalEntry } from "@/lib/journal";

const today = () => new Date().toISOString().slice(0, 10);

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(today());
  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState("");
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [thesis, setThesis] = useState("");
  const [exitCondition, setExitCondition] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/paper-trading/journal");
      if (!res.ok) {
        setError("Could not load your journal.");
        setLoading(false);
        return;
      }
      setEntries(await res.json());
      setLoading(false);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/paper-trading/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, ticker, companyName: company, action, thesis, exitCondition }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save that entry.");
      return;
    }

    setEntries([await res.json(), ...entries]);
    setTicker("");
    setCompany("");
    setThesis("");
    setExitCondition("");
  }

  return (
    <Card as="section" className="mt-4" id="journal">
      <SectionHeader
        label="trade journal"
        description="Private to your account. The database itself enforces that, not just this page."
      />

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableHeadCellClass}>Date</th>
              <th className={tableHeadCellClass}>Ticker</th>
              <th className={tableHeadCellClass}>Action</th>
              <th className={tableHeadCellClass}>Thesis</th>
              <th className={tableHeadCellClass}>Exit Condition</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className={`${tableRowClass} align-top`}>
                <td className={`${tableCellClass} whitespace-nowrap pr-3`}>{entry.date}</td>
                <td className={`${tableCellStrongClass} pr-3`}>
                  {entry.ticker}
                  {entry.companyName && (
                    <span className="block text-[10px] font-normal text-zinc-500">
                      {entry.companyName}
                    </span>
                  )}
                </td>
                <td
                  className={`${tableCellClass} pr-3 caps ${entry.action === "buy" ? "text-good" : "text-bad"}`}
                >
                  {entry.action}
                </td>
                <td className={`${tableCellClass} pr-3 leading-4`}>{entry.thesis}</td>
                <td className={`${tableCellClass} leading-4`}>{entry.exitCondition}</td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <EmptyRow colSpan={5}>no journal entries yet</EmptyRow>
            )}
            {loading && <EmptyRow colSpan={5}>loading your entries...</EmptyRow>}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="mt-3 text-xs leading-5 text-bad" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <Field
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-auto"
        />
        <Field
          label="Ticker"
          placeholder="AAPL"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          required
          className="w-24"
        />
        <Field
          label="Company"
          suffix="optional"
          placeholder="Apple Inc."
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          wrapperClassName="min-w-32 flex-1"
        />
        <SelectField
          label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value as "buy" | "sell")}
          options={[
            { value: "buy", label: "Buy" },
            { value: "sell", label: "Sell" },
          ]}
        />
        <Field
          label="Thesis (one line)"
          placeholder="Why this trade"
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          required
          wrapperClassName="min-w-40 flex-1"
        />
        <Field
          label="Exit Condition"
          placeholder="What makes you sell"
          value={exitCondition}
          onChange={(e) => setExitCondition(e.target.value)}
          required
          wrapperClassName="min-w-40 flex-1"
        />
        <Button type="submit" loading={saving} loadingLabel="Saving">
          Add Entry
        </Button>
      </form>
    </Card>
  );
}
