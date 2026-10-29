"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, SectionHeader } from "@/components/ui";
import type { Prediction } from "@/lib/calibration";
import type { KalshiPick } from "@/lib/kalshiPicks";

// Rapid mode: one Kalshi market at a time. Read the question, see the
// crowd's price, and tap how far you'd move it; that logs a prediction
// instantly (the server reads the live price, /api/calibration/rapid) and
// shows the next card. Keys 1-5 pick a move, S skips, U undoes the last one.

const MOVES = [
  { shift: -0.2, label: "Much lower", key: "1" },
  { shift: -0.1, label: "Lower", key: "2" },
  { shift: 0, label: "Same", key: "3" },
  { shift: 0.1, label: "Higher", key: "4" },
  { shift: 0.2, label: "Much higher", key: "5" },
];

const pct = (p: number) => `${Math.round(p * 100)}%`;
const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));
const settles = (days: number) =>
  days < 1 ? `settles in ~${Math.max(1, Math.round(days * 24))} hours` : `settles in ~${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;

export default function RapidMode({ onLogged }: { onLogged: () => void }) {
  const [cards, setCards] = useState<KalshiPick[] | null>(null);
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<Prediction[]>([]);

  async function start() {
    setStarted(true);
    setError(null);
    const res = await fetch("/api/calibration/rapid");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load markets.");
    setCards(body.cards ?? []);
    setI(0);
  }

  const card = cards?.[i];

  const choose = useCallback(
    async (shift: number) => {
      if (!card || busy) return;
      setBusy(true);
      setError(null);
      const res = await fetch("/api/calibration/rapid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: card.ticker, shift }),
      });
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) setError(body.error ?? "Couldn't log that one.");
      else {
        setLogged((l) => [body as Prediction, ...l]);
        onLogged();
      }
      setI((n) => n + 1);
    },
    [card, busy, onLogged],
  );

  const undo = useCallback(async () => {
    const last = logged[0];
    if (!last || busy) return;
    setBusy(true);
    const res = await fetch(`/api/calibration/${last.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError("Couldn't undo that one (it may have resolved already).");
    setLogged((l) => l.slice(1));
    // Put the card back so it can be answered again.
    setI((n) => Math.max(0, n - 1));
    onLogged();
  }, [logged, busy, onLogged]);

  // Keyboard: 1-5 choose, S skip, U undo.
  useEffect(() => {
    if (!started || !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const move = MOVES.find((m) => m.key === e.key);
      if (move) choose(move.shift);
      else if (e.key.toLowerCase() === "s") setI((n) => n + 1);
      else if (e.key.toLowerCase() === "u") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, card, choose, undo]);

  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="rapid mode"
        description="The fast way to build volume. One live Kalshi market at a time: read the question, look at the crowd's price, and tap how far you'd move it. Each tap logs a prediction (your probability = the crowd's price, moved that much) and shows the next one. These markets settle within two weeks, many within days, so your scores come in fast."
      />
      {!started ? (
        <div className="mt-3">
          <Button onClick={start}>Start rapid mode</Button>
        </div>
      ) : cards === null ? (
        <p className="mt-3 text-xs text-zinc-500">{error ?? "Loading markets..."}</p>
      ) : !card ? (
        <p className="mt-3 text-xs text-foreground">
          That&apos;s the whole deck: {logged.length} logged this session. New markets show up every few hours.
        </p>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3 text-[10px] caps text-zinc-500">
            <span>
              {card.category} · {settles(card.daysLeft)}
            </span>
            <span className="tabular-nums">
              card {i + 1} of {cards.length} · {logged.length} logged
            </span>
          </div>
          <p className="mt-2 min-h-[2.5rem] text-sm leading-6 text-foreground">{card.question}</p>
          <p className="mt-1 text-xs text-zinc-500">
            The crowd says{" "}
            <span className="text-lg tabular-nums text-foreground">{card.probability === null ? "?" : pct(card.probability)}</span>{" "}
            chance of YES. How would you move it?
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MOVES.map((m) => (
              <Button key={m.shift} variant={m.shift === 0 ? "solid" : "outline"} disabled={busy} onClick={() => choose(m.shift)}>
                {m.label} {card.probability !== null && <span className="tabular-nums opacity-70">→ {pct(clamp(card.probability + m.shift))}</span>}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] caps text-zinc-500">
            <button type="button" onClick={() => setI((n) => n + 1)} className="hover:text-foreground">
              Skip (S)
            </button>
            {logged.length > 0 && (
              <button type="button" onClick={undo} disabled={busy} className="hover:text-foreground">
                Undo last (U)
              </button>
            )}
            <span>keys 1-5 pick a move</span>
          </div>
          {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          {logged[0] && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Last logged: you {pct(logged[0].myProbability)} vs crowd {pct(logged[0].marketProbability)} on &ldquo;
              {logged[0].question.slice(0, 70)}
              {logged[0].question.length > 70 ? "..." : ""}&rdquo;
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
