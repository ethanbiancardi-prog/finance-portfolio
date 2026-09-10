export type TickerMatch = { symbol: string; name: string; exchange: string };

// Ranks: exact ticker > ticker prefix > name starts with query > a word in
// the name starts with query > name contains query. Ties keep the source
// list's order — EDGAR's file is roughly market-cap ordered, so "micro"
// surfaces Microsoft/Micron ahead of micro-caps.
function score(m: TickerMatch, q: string): number {
  const sym = m.symbol.toLowerCase();
  const name = m.name.toLowerCase();
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (name.split(/[\s,.&-]+/).some((w) => w.startsWith(q))) return 3;
  if (name.includes(q)) return 4;
  return -1;
}

export function searchTickers(list: TickerMatch[], query: string, limit = 8): TickerMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { m: TickerMatch; s: number; i: number }[] = [];
  list.forEach((m, i) => {
    const s = score(m, q);
    if (s >= 0) scored.push({ m, s, i });
  });
  scored.sort((a, b) => a.s - b.s || a.i - b.i);
  return scored.slice(0, limit).map((x) => x.m);
}
