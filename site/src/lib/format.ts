// Shared formatters. Each is named for what it formats so the call site keeps
// the math intent visible (millions vs full currency vs a raw ratio).

export function formatMoneyMillions(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `$${Math.round(value).toLocaleString()}M`;
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
