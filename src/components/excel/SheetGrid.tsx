import { useState } from "react";

import type { Sheet } from "@/lib/spreadsheet";
import { cn } from "@/lib/utils";

function colLabel(index: number) {
  let label = "";
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
}

type Props = {
  sheet: Sheet;
  onCellChange: (row: number, col: number, value: string) => void;
};

export function SheetGrid({ sheet, onCellChange }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const cols = Math.max(8, ...sheet.rows.map((r) => r.length));
  const rows = Math.max(20, sheet.rows.length);

  return (
    <div className="h-full overflow-auto">
      <table className="border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-30 w-12 border-r border-b border-grid-line bg-grid-header text-xs font-medium text-muted-foreground" />
            {Array.from({ length: cols }).map((_, c) => (
              <th
                key={c}
                className="min-w-[7.5rem] border-r border-b border-grid-line bg-grid-header px-2 py-1.5 text-xs font-semibold text-muted-foreground"
              >
                {colLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="group">
              <td className="sticky left-0 z-10 border-r border-b border-grid-line bg-grid-header px-2 py-1 text-center text-xs font-medium text-muted-foreground">
                {r + 1}
              </td>
              {Array.from({ length: cols }).map((_, c) => {
                const value = sheet.rows[r]?.[c] ?? "";
                const id = `${r}:${c}`;
                const isFormula = value.startsWith("=");
                const isHeader = r === 0 && value !== "";
                return (
                  <td key={c} className="border-r border-b border-grid-line bg-card p-0">
                    <input
                      value={value}
                      onFocus={() => setActive(id)}
                      onBlur={() => setActive(null)}
                      onChange={(e) => onCellChange(r, c, e.target.value)}
                      className={cn(
                        "w-full bg-transparent px-2 py-1 outline-none",
                        isHeader && "font-semibold text-foreground",
                        isFormula && "cell-formula",
                        active === id && "ring-2 ring-inset ring-ring",
                        !isFormula && /^[-$(]?[\d,.]+%?\)?$/.test(value) && "text-right tabular-nums",
                      )}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
