// Shared formatters. Each is named for what it formats so the call site keeps
// the math intent visible (millions vs full currency vs a raw ratio).

// Input is in $ millions. Scales the unit so big companies stay readable:
// $820M, $47.9B, $3.2T — "$31,709,067M" fits nowhere.
export function formatMoneyMillions(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}T`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}B`;
  return `${sign}$${Math.round(abs).toLocaleString()}M`;
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return "N/A";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "N/A";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrencyCompact(value: number | string | null | undefined): string {
  if (value == null) return "N/A";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "N/A";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

// value is a decimal, e.g. 0.08 -> "8.0%"
export function formatPercent(
  value: number | string | null | undefined,
  opts?: { decimals?: number }
): string {
  if (value == null) return "N/A";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "N/A";
  const decimals = opts?.decimals ?? 1;
  return `${(num * 100).toFixed(decimals)}%`;
}

export function formatRatio(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return value.toFixed(2);
}
