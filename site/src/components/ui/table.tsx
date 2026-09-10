import type { ReactNode } from "react";

export const tableHeadRowClass = "border-b border-border";
export const tableHeadCellClass =
  "py-1 text-[10px] font-normal uppercase tracking-[0.14em] text-zinc-500";
export const tableRowClass = "border-b border-border/50 last:border-b-0 hover:bg-accent/[0.06]";
export const tableCellClass = "py-1 text-xs tabular-nums text-zinc-400";
export const tableCellStrongClass = "py-1 text-xs tabular-nums text-foreground";

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-3 text-xs text-zinc-500">
        <span className="text-zinc-600">-- </span>
        {children}
      </td>
    </tr>
  );
}
