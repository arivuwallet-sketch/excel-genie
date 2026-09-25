import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Sheet } from "@/lib/spreadsheet";
import { formulaCompatibility } from "@/lib/formula-compatibility";
import {
  cleanSheet,
  pivotSheet,
  profileSheet,
  type CleanAction,
} from "@/lib/workbook-intelligence";
type Props = {
  sheet: Sheet;
  onPropose: (sheet: Sheet, label: string, append?: boolean) => void;
  onAsk: (prompt: string) => void;
  disabled: boolean;
};
export function InsightsPanel({ sheet, onPropose, onAsk, disabled }: Props) {
  const compatibility = useMemo(() => formulaCompatibility([sheet]), [sheet]);
  const profile = useMemo(() => profileSheet(sheet), [sheet]);
  const [group, setGroup] = useState(0),
    [value, setValue] = useState(1);
  const [aggregation, setAggregation] = useState<"sum" | "average" | "count">("sum");
  const actualGroup = Math.min(group, Math.max(0, profile.columns.length - 1)),
    actualValue = Math.min(value, Math.max(0, profile.columns.length - 1));
  const clean = (action: CleanAction, label: string) => onPropose(cleanSheet(sheet, action), label);
  return (
    <section className="space-y-5 p-4 text-sm" aria-label="Workbook insights">
      <div>
        <h2 className="font-semibold">Data intelligence</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {sheet.name} · row 1 is treated as headers. Formula results are excluded from numeric
          statistics.
        </p>
      </div>
      {compatibility.formulaCount > 0 && (
        <div className="space-y-2 rounded-lg border p-3" role="note">
          <h3 className="font-medium">Formula compatibility</h3>
          <p className="text-xs text-muted-foreground">
            {compatibility.formulaCount} formulas are stored for export. Calculate and verify
            results in Excel.
          </p>
          {compatibility.modern.length > 0 && (
            <p className="text-xs">
              Requires a compatible Excel version: {compatibility.modern.join(", ")}.
            </p>
          )}
          {compatibility.connected.length > 0 && (
            <p className="text-xs text-destructive">
              Requires separately configured services or add-ins:{" "}
              {compatibility.connected.join(", ")}. These functions do not execute in this app, and
              exporting their text does not configure them.
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {[
          [profile.rows, "Data rows"],
          [profile.columns.length, "Columns"],
          [profile.duplicates, "Duplicate rows"],
          [profile.missing, "Missing cells"],
        ].map(([n, label]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <strong className="block text-xl">{Number(n).toLocaleString()}</strong>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => clean("trim", "Trim whitespace")}
        >
          Trim whitespace
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => clean("deduplicate", "Remove duplicate rows")}
        >
          Deduplicate
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => clean("remove_blank_rows", "Remove empty rows")}
        >
          Remove empty rows
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cleaning opens a preview. Removing rows is blocked when the workbook contains formulas,
        because references would need updating.
      </p>
      <div className="space-y-2">
        <h3 className="font-medium">Pivot summary</h3>
        <label className="block text-xs">
          Group by
          <select
            className="mt-1 w-full rounded border bg-background p-2"
            value={actualGroup}
            onChange={(e) => setGroup(Number(e.target.value))}
          >
            {profile.columns.map((c) => (
              <option value={c.index} key={c.index}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          Value column
          <select
            className="mt-1 w-full rounded border bg-background p-2"
            value={actualValue}
            onChange={(e) => setValue(Number(e.target.value))}
          >
            {profile.columns.map((c) => (
              <option value={c.index} key={c.index}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          Aggregation
          <select
            className="mt-1 w-full rounded border bg-background p-2"
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value as typeof aggregation)}
          >
            <option value="sum">Sum</option>
            <option value="average">Average</option>
            <option value="count">Row count</option>
          </select>
        </label>
        <Button
          size="sm"
          disabled={disabled || !profile.rows}
          onClick={() =>
            onPropose(
              pivotSheet(sheet, actualGroup, actualValue, aggregation),
              "Create pivot summary",
              true,
            )
          }
        >
          Preview summary sheet
        </Button>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Column profiles</h3>
        {profile.columns.map((c) => (
          <div key={c.index} className="rounded-lg border p-3">
            <p className="truncate font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground">
              {c.unique} unique · {c.missing} missing · {c.formulas} formulas
            </p>
            {c.numeric > 0 && (
              <p className="mt-1 text-xs">
                Min {c.min?.toLocaleString()} · Max {c.max?.toLocaleString()}
                <br />
                Mean {c.mean?.toLocaleString(undefined, { maximumFractionDigits: 3 })} ·{" "}
                {c.outliers} possible outliers (IQR)
              </p>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() =>
          onAsk(
            `Explain data quality in '${sheet.name}'. Cite specific cells, distinguish values from assumptions, and suggest next steps without editing.`,
          )
        }
      >
        Ask AI about this data
      </Button>
    </section>
  );
}
