import type { ReactNode } from "react";

export const tableHeadRowClass = "text-zinc-500";
export const tableHeadCellClass = "py-2 font-medium";
export const tableRowClass = "border-t border-zinc-200 dark:border-zinc-800";
export const tableCellClass = "py-2 tabular-nums text-zinc-600 dark:text-zinc-400";
export const tableCellStrongClass = "py-2 tabular-nums text-black dark:text-zinc-50";

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-4 text-zinc-500">
        {children}
      </td>
    </tr>
  );
}
