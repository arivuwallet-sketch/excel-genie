import { useState } from "react";
import type { Sheet } from "@/lib/spreadsheet";
import { columnLabel } from "@/lib/workbook-intelligence";
import {
  reconcileSheets,
  joinSheets,
  consolidateSheets,
  findReplace,
  splitColumn,
  stressSheet,
  syntheticTransactions,
} from "@/lib/workflows";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const tools = {
  reconcile: [
    "Reconcile",
    "Compare two tables by a shared key and amount. Duplicate keys are flagged, never guessed.",
  ],
  join: [
    "Join tables",
    "Enrich the left table with columns from a unique lookup table. Unmatched records stay visible.",
  ],
  consolidate: [
    "Consolidate",
    "Combine every sheet by matching column headings, with source sheet and row for traceability.",
  ],
  replace: [
    "Find & replace",
    "Replace literal text in the active sheet. Formula cells are preserved.",
  ],
  split: ["Split text", "Keep the original column and append the separated parts."],
  stress: [
    "Stress scenario",
    "Create a separate scenario by changing a numeric column by a percentage.",
  ],
  synthetic: [
    "Generate test data",
    "Create clearly labelled synthetic transactions for testing. The same seed produces the same data.",
  ],
} as const;
type Workflow = keyof typeof tools;
const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export function WorkflowHub({
  open,
  onOpenChange,
  sheets,
  activeIndex,
  disabled,
  onPropose,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheets: Sheet[];
  activeIndex: number;
  disabled: boolean;
  onPropose: (sheet: Sheet, label: string, append?: boolean) => void;
}) {
  const [workflow, setWorkflow] = useState<Workflow>("reconcile");
  const [leftIndex, setLeftIndex] = useState(0),
    [rightIndex, setRightIndex] = useState(1);
  const [leftKey, setLeftKey] = useState(0),
    [rightKey, setRightKey] = useState(0);
  const [leftAmount, setLeftAmount] = useState(1),
    [rightAmount, setRightAmount] = useState(1);
  const [tolerance, setTolerance] = useState("0.01"),
    [caseSensitive, setCaseSensitive] = useState(false);
  const [find, setFind] = useState(""),
    [replacement, setReplacement] = useState(""),
    [delimiter, setDelimiter] = useState(",");
  const [column, setColumn] = useState(0),
    [percent, setPercent] = useState("-10"),
    [count, setCount] = useState("100"),
    [seed, setSeed] = useState("42");
  const [error, setError] = useState("");
  const left = sheets[Math.min(leftIndex, sheets.length - 1)]!,
    right = sheets[Math.min(rightIndex, sheets.length - 1)]!,
    active = sheets[activeIndex]!;
  const numeric = (raw: string, label: string) => {
    if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error(`Enter a valid ${label}.`);
    return Number(raw);
  };
  const chooseColumn = (
    sheet: Sheet,
    value: number,
    setter: (v: number) => void,
    label: string,
  ) => (
    <label className="space-y-1 text-sm">
      <span>{label}</span>
      <select
        aria-label={label}
        className={inputClass}
        value={value}
        onChange={(e) => setter(Number(e.target.value))}
      >
        {(sheet.rows[0] ?? []).map((heading, c) => (
          <option key={c} value={c}>
            {columnLabel(c)} · {heading || "Unnamed column"}
          </option>
        ))}
      </select>
    </label>
  );
  const chooseSheet = (value: number, setter: (v: number) => void, label: string) => (
    <label className="space-y-1 text-sm">
      <span>{label}</span>
      <select
        aria-label={label}
        className={inputClass}
        value={Math.min(value, sheets.length - 1)}
        onChange={(e) => setter(Number(e.target.value))}
      >
        {sheets.map((s, i) => (
          <option key={s.name} value={i}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
  const run = () => {
    setError("");
    try {
      if ((workflow === "reconcile" || workflow === "join") && left === right)
        throw new Error(
          "Choose two different source sheets. Upload both files together, or use Add files.",
        );
      let output: Sheet;
      switch (workflow) {
        case "reconcile":
          output = reconcileSheets(left, right, {
            leftKey,
            rightKey,
            leftAmount,
            rightAmount,
            tolerance: numeric(tolerance, "tolerance"),
            caseSensitive,
          });
          break;
        case "join":
          output = joinSheets(left, right, leftKey, rightKey);
          break;
        case "consolidate":
          output = consolidateSheets(sheets);
          break;
        case "replace":
          output = findReplace(active, find, replacement, caseSensitive);
          break;
        case "split":
          output = splitColumn(active, column, delimiter === "\\t" ? "\t" : delimiter);
          break;
        case "stress":
          output = stressSheet(active, column, numeric(percent, "percentage"));
          break;
        case "synthetic": {
          const n = numeric(seed, "seed");
          if (!Number.isInteger(n) || n < 0 || n > 4294967295)
            throw new Error("Seed must be a whole number from 0 to 4,294,967,295.");
          output = syntheticTransactions(numeric(count, "row count"), n);
          break;
        }
      }
      onPropose(output, tools[workflow][0], workflow !== "replace");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workflow failed. No data changed.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Workbook workflows</DialogTitle>
          <DialogDescription>
            Run directly on your data, without an AI connection. Review every result before applying
            it. Table workflows use row 1 as headings and require values; use Calculate for formula
            data.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(tools) as Workflow[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={workflow === key ? "default" : "outline"}
              onClick={() => {
                setWorkflow(key);
                setError("");
              }}
            >
              {tools[key][0]}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{tools[workflow][1]}</p>
        {(workflow === "reconcile" || workflow === "join") && (
          <div className="grid gap-3 sm:grid-cols-2">
            {chooseSheet(leftIndex, setLeftIndex, "Left source")}
            {chooseSheet(rightIndex, setRightIndex, "Right source")}
            {chooseColumn(left, leftKey, setLeftKey, "Left key")}
            {chooseColumn(right, rightKey, setRightKey, "Right key")}
            {workflow === "reconcile" && (
              <>
                {chooseColumn(left, leftAmount, setLeftAmount, "Left amount")}
                {chooseColumn(right, rightAmount, setRightAmount, "Right amount")}
                <label className="text-sm">
                  Amount tolerance
                  <input
                    className={inputClass}
                    aria-label="Amount tolerance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={tolerance}
                    onChange={(e) => setTolerance(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        )}
        {workflow === "consolidate" && (
          <p className="rounded border p-3 text-sm">
            Sources: {sheets.map((s) => s.name).join(", ")}
          </p>
        )}
        {["replace", "split", "stress"].includes(workflow) && (
          <p className="text-sm">
            Source: <strong>{active.name}</strong>
          </p>
        )}
        {workflow === "replace" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Find text
              <input
                aria-label="Find text"
                className={inputClass}
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Replace with
              <input
                aria-label="Replace with"
                className={inputClass}
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
            </label>
          </div>
        )}
        {(workflow === "reconcile" || workflow === "replace") && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Case sensitive
          </label>
        )}
        {(workflow === "split" || workflow === "stress") &&
          chooseColumn(active, column, setColumn, "Source column")}
        {workflow === "split" && (
          <label className="text-sm">
            Separator (use \t for tabs)
            <input
              aria-label="Separator"
              className={inputClass}
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
            />
          </label>
        )}
        {workflow === "stress" && (
          <label className="text-sm">
            Change percent
            <input
              aria-label="Change percent"
              className={inputClass}
              type="number"
              min="-100"
              max="1000"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </label>
        )}
        {workflow === "synthetic" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Data rows
              <input
                aria-label="Data rows"
                className={inputClass}
                type="number"
                min="1"
                max="9999"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Random seed
              <input
                aria-label="Random seed"
                className={inputClass}
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button onClick={run} disabled={disabled}>
          Preview result
        </Button>
        {disabled && (
          <p className="text-sm">
            Finish the current request or review the pending proposal first.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
