import { useEffect, useState } from "react";
import type { Sheet } from "@/lib/spreadsheet";
import type { Calculation } from "@/lib/calculation";
import { SUPPORTED_FUNCTIONS } from "@/lib/calculator/evaluate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CalculationPanel({
  open,
  onOpenChange,
  sheets,
  activeIndex,
  disabled,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheets: Sheet[];
  activeIndex: number;
  disabled: boolean;
  onCopy: (sheet: Sheet) => void;
}) {
  const [state, setState] = useState<{
    source: Sheet[];
    result?: Calculation;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    setState(null);
    let worker: Worker;
    try {
      worker = new Worker(new URL("../../lib/calculation.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      setState({
        source: sheets,
        error: "Calculation worker could not start. Retry after reloading.",
      });
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      setState({
        source: sheets,
        error: "Calculation exceeded 10 seconds. Reduce the workbook or calculate in Excel.",
      });
    }, 10000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      setState({
        source: sheets,
        ...(event.data.ok ? { result: event.data.result } : { error: event.data.error }),
      });
      worker.terminate();
    };
    worker.onerror = () => {
      clearTimeout(timer);
      setState({ source: sheets, error: "Calculation failed. Original formulas are preserved." });
      worker.terminate();
    };
    worker.postMessage(sheets);
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [open, sheets]);
  const current = state?.source === sheets ? state : null;
  const result = current?.result,
    sheet = result?.sheets[activeIndex];
  const errors = result?.issues.filter((i) => i.sheet === sheet?.name) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Calculate workbook</DialogTitle>
          <DialogDescription>
            Local preview of supported scalar formulas. Original formulas remain intact. Unsupported
            functions, array results, volatile functions and oversized ranges require Excel.
          </DialogDescription>
        </DialogHeader>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Supported formulas and limits</summary>
          <p className="mt-2">
            Arithmetic, comparisons, text concatenation, cell and bounded range references.
            Functions: {SUPPORTED_FUNCTIONS.join(", ")}. VLOOKUP and MATCH support exact matches
            only. Named ranges, table references, dates, full-column ranges, arrays and connected
            functions require Excel.
          </p>
        </details>
        {!current && <p role="status">Calculating in a background worker…</p>}
        {current?.error && (
          <p role="alert" className="text-destructive">
            {current.error}
          </p>
        )}
        {disabled && (
          <p className="text-sm">
            Finish the current request or review the pending proposal before creating a copy.
          </p>
        )}
        {result && sheet && (
          <>
            <p role="status" className="text-sm">
              {result.formulaCount} formulas checked · {result.issues.length} calculation errors
              across the workbook
            </p>
            {errors.length > 0 && (
              <div className="rounded border p-3 text-sm" role="alert">
                Resolve these errors before creating a values copy:{" "}
                {errors
                  .slice(0, 12)
                  .map((i) => `${i.cell} ${i.error}`)
                  .join(", ")}
                {errors.length > 12 ? "…" : ""}
              </div>
            )}
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-sm">
                <caption className="p-2 text-left font-semibold">
                  {sheet.name} · first 100 rows and 16 columns
                </caption>
                <tbody>
                  {sheet.rows.slice(0, 100).map((row, r) => (
                    <tr key={r}>
                      {row.slice(0, 16).map((v, c) => (
                        <td key={c} className="whitespace-nowrap border px-3 py-1.5">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              disabled={disabled || errors.length > 0}
              onClick={() => {
                onCopy({ ...sheet, name: `${sheet.name.slice(0, 23)} Values` });
                onOpenChange(false);
              }}
            >
              Preview values copy of {sheet.name}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
