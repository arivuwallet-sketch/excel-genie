import { SlidersHorizontal } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { Sheet } from "@/lib/spreadsheet";

export type Assumption = {
  /** Sheet index / row / col of the driver cell. */
  sheet: number;
  row: number;
  col: number;
  label: string;
  value: number;
  isPercent: boolean;
};

const KEYWORDS =
  /(growth|margin|rate|wacc|discount|churn|tax|multiple|inflation|escalat|price|terminal|exit|interest|utilis|utiliz)/i;

/** Find up to `limit` numeric driver cells that look like key model assumptions. */
export function findAssumptions(sheets: Sheet[], limit = 5): Assumption[] {
  const out: Assumption[] = [];
  sheets.forEach((s, si) => {
    s.rows.forEach((row, ri) => {
      const label = row[0] ?? "";
      if (!KEYWORDS.test(label)) return;
      for (let ci = 1; ci < row.length; ci++) {
        const raw = (row[ci] ?? "").trim();
        if (!raw || raw.startsWith("=")) continue;
        const pct = raw.endsWith("%");
        const n = Number(raw.replace(/[%,$\s]/g, ""));
        if (!Number.isFinite(n)) continue;
        out.push({ sheet: si, row: ri, col: ci, label, value: n, isPercent: pct || n < 1 });
        return;
      }
    });
  });
  return out.slice(0, limit);
}

type Props = {
  assumptions: Assumption[];
  scenario: string;
  onScenario: (s: string) => void;
  depreciation: string;
  onDepreciation: (s: string) => void;
  liveFormulas: boolean;
  onLiveFormulas: (v: boolean) => void;
  onAssumptionChange: (a: Assumption, value: number) => void;
};

export function ModelControls({
  assumptions,
  scenario,
  onScenario,
  depreciation,
  onDepreciation,
  liveFormulas,
  onLiveFormulas,
  onAssumptionChange,
}: Props) {
  return (
    <div className="space-y-4 border-t border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <SlidersHorizontal className="size-3.5" /> MODEL CONTROLS
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Scenario</Label>
          <Select value={scenario} onValueChange={onScenario}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Base", "Upside", "Downside", "Management"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Depreciation method</Label>
          <Select value={depreciation} onValueChange={onDepreciation}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Straight-line", "Declining balance (DB)", "Double-declining (DDB)", "Sum-of-years (SYD)", "Units of production"].map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <Label className="text-xs">Highlight formula cells</Label>
        <Switch checked={liveFormulas} onCheckedChange={onLiveFormulas} />
      </div>

      {assumptions.length > 0 && (
        <div className="space-y-3">
          {assumptions.map((a) => (
            <div key={`${a.sheet}-${a.row}-${a.col}`} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="truncate text-xs">{a.label}</Label>
                <span className="font-mono text-xs text-primary">
                  {a.isPercent ? `${a.value}${String(a.value).includes("%") ? "" : "%"}` : a.value}
                </span>
              </div>
              <Slider
                value={[a.value]}
                min={a.isPercent ? 0 : Math.min(0, a.value * 0.5)}
                max={a.isPercent ? Math.max(50, a.value * 2) : Math.max(1, a.value * 2)}
                step={a.isPercent ? 0.5 : Math.max(1, Math.round(Math.abs(a.value) / 100))}
                onValueChange={([v]) => v !== undefined && onAssumptionChange(a, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
