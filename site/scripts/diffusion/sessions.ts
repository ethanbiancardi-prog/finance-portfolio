// Shared timing helpers for the information-diffusion scripts.
//
// The "reaction session" of an 8-K is the first regular trading session
// (9:30am-4pm New York time) in which the news could be traded:
//   - filed during a session      -> that session, from the minute it was filed
//   - filed before the open       -> that day's session, from the open
//   - filed after the close, or on a weekend/holiday -> the next session's open

export const OPEN = 9 * 60 + 30; // minutes after midnight, New York
export const CLOSE = 16 * 60;

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// A UTC timestamp as New York date and minute of the day.
export function nyParts(iso: string): { date: string; minute: number } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

// `calendar` = every trading day, ascending (SPY's daily bars).
export function reactionSession(acceptedIso: string, calendar: string[]): { day: string; intraday: boolean } | null {
  const { date, minute } = nyParts(acceptedIso);
  if (calendar.includes(date) && minute < CLOSE) return { day: date, intraday: minute >= OPEN };
  const next = calendar.find((d) => d > date);
  return next ? { day: next, intraday: false } : null;
}
