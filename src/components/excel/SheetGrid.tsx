import { useMemo, useState } from "react";
import type { Sheet } from "@/lib/spreadsheet";
import { parseDelimited } from "@/lib/spreadsheet";
import { columnLabel } from "@/lib/workbook-intelligence";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
type Props = {
  sheet: Sheet;
  onCellChange: (row: number, col: number, value: string) => void;
  onRangeChange: (row: number, col: number, values: string[][]) => void;
  highlightFormulas?: boolean;
};
const PAGE_SIZE = 100,
  COL_PAGE_SIZE = 16;
export function SheetGrid({ sheet, onCellChange, onRangeChange, highlightFormulas = true }: Props) {
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [colPage, setColPage] = useState(0);
  const cols = Math.max(
    8,
    sheet.rows.reduce((n, r) => Math.max(n, r.length), 0),
  );
  const rowIndices = useMemo(
    () =>
      Array.from({ length: Math.max(20, sheet.rows.length) }, (_, i) => i).filter(
        (i) =>
          !query ||
          (sheet.rows[i] ?? []).some((v) => v.toLowerCase().includes(query.toLowerCase())),
      ),
    [sheet, query],
  );
  const safePage = Math.min(page, Math.max(0, Math.ceil(rowIndices.length / PAGE_SIZE) - 1)),
    safeColPage = Math.min(colPage, Math.max(0, Math.ceil(cols / COL_PAGE_SIZE) - 1));
  const visibleRows = rowIndices.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const visibleCols = Array.from(
    { length: Math.min(COL_PAGE_SIZE, cols - safeColPage * COL_PAGE_SIZE) },
    (_, i) => safeColPage * COL_PAGE_SIZE + i,
  );
  const selected = sheet.rows[active.row]?.[active.col] ?? "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2 text-xs">
        <span className="min-w-12 rounded bg-muted px-2 py-1 font-mono">
          {columnLabel(active.col)}
          {active.row + 1}
        </span>
        <span className="font-serif italic text-muted-foreground">fx</span>
        <input
          key={`${active.row}:${active.col}:${selected}`}
          aria-label="Formula bar"
          defaultValue={selected}
          onBlur={(e) => {
            if (e.target.value !== selected) onCellChange(active.row, active.col, e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="min-w-32 flex-1 rounded border bg-background px-2 py-1 font-mono"
        />
        <input
          aria-label="Search sheet"
          placeholder="Find in sheet…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          className="w-36 rounded border bg-background px-2 py-1"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 w-12 border-b border-r bg-grid-header" />
              {visibleCols.map((c) => (
                <th
                  key={c}
                  className="min-w-[7.5rem] border-b border-r border-grid-line bg-grid-header px-2 py-1.5 text-xs"
                >
                  {columnLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 border-b border-r border-grid-line bg-grid-header px-2 py-1 text-center text-xs">
                  {r + 1}
                </td>
                {visibleCols.map((c) => {
                  const value = sheet.rows[r]?.[c] ?? "";
                  return (
                    <td key={c} className="border-b border-r border-grid-line bg-card p-0">
                      <input
                        key={value}
                        aria-label={`${sheet.name}!${columnLabel(c)}${r + 1}`}
                        defaultValue={value}
                        onFocus={() => setActive({ row: r, col: c })}
                        onBlur={(e) => {
                          if (e.target.value !== value) onCellChange(r, c, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            e.currentTarget.value = value;
                            e.currentTarget.blur();
                          }
                        }}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData("text/plain");
                          if (!/[\t\r\n]/.test(text)) return;
                          e.preventDefault();
                          e.currentTarget.value = value;
                          try {
                            onRangeChange(r, c, parseDelimited(text));
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Paste failed");
                          }
                        }}
                        className={cn(
                          "w-full bg-transparent px-2 py-1 outline-none focus:ring-2 focus:ring-inset focus:ring-ring",
                          r === 0 && "font-semibold",
                          value.startsWith("=") && highlightFormulas && "cell-formula",
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleRows.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">No matching rows.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-card px-2 py-1 text-xs">
        <Button
          variant="ghost"
          size="sm"
          disabled={!safePage}
          onClick={() => setPage(safePage - 1)}
        >
          Previous rows
        </Button>
        <span>
          {rowIndices.length ? safePage * PAGE_SIZE + 1 : 0}–
          {Math.min((safePage + 1) * PAGE_SIZE, rowIndices.length)} of {rowIndices.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={(safePage + 1) * PAGE_SIZE >= rowIndices.length}
          onClick={() => setPage(safePage + 1)}
        >
          Next rows
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!safeColPage}
          onClick={() => setColPage(safeColPage - 1)}
        >
          ← Columns
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={(safeColPage + 1) * COL_PAGE_SIZE >= cols}
          onClick={() => setColPage(safeColPage + 1)}
        >
          Columns →
        </Button>
        <span className="ml-auto text-muted-foreground">Formulas recalculate in Excel.</span>
      </div>
    </div>
  );
}
