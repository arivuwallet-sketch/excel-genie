import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detectColumns } from "@/lib/dashboard-columns";
import { toNumber } from "@/lib/excel-export";
import type { Sheet } from "@/lib/spreadsheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheets: Sheet[];
  activeIndex: number;
};

type ChartKind = "bar" | "line" | "pie";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * The app has no client-side formula engine (formulas are stored and displayed as text, only
 * computed when opened in real Excel), so this reads literal numeric inputs only — a formula
 * cell like "=SUM(...)" is not a chartable number here. That's most of a typical data table.
 */
export function DashboardHub({ open, onOpenChange, sheets, activeIndex }: Props) {
  const [sheetIndex, setSheetIndex] = useState(activeIndex);
  const [kind, setKind] = useState<ChartKind>("bar");
  const sheet = sheets[Math.min(sheetIndex, sheets.length - 1)] ?? sheets[0];

  const { header, dataRows, numericCols, textCols } = useMemo(
    () => detectColumns(sheet ?? { name: "", rows: [] }),
    [sheet],
  );

  const [labelCol, setLabelCol] = useState<number | null>(null);
  const [valueCol, setValueCol] = useState<number | null>(null);

  const effectiveLabelCol = labelCol ?? textCols[0] ?? 0;
  const effectiveValueCol = valueCol ?? numericCols[0] ?? null;
  // Only offer text-like columns as the category axis — a formula or numeric column picked here
  // renders formula text or raw numbers as the pie/bar labels, which is exactly the "collapsed
  // into nonsense" look this list exists to prevent. Fall back to every column only if the sheet
  // genuinely has no detected text column at all.
  const labelOptions = textCols.length > 0 ? textCols : header.map((_, c) => c);

  const chartData = useMemo(() => {
    if (effectiveValueCol === null) return [];
    return dataRows
      .filter((row) => (row[effectiveValueCol] ?? "") !== "")
      .map((row) => ({
        label: String(row[effectiveLabelCol] ?? "").slice(0, 20) || "—",
        value: toNumber(row[effectiveValueCol] ?? "") ?? 0,
      }))
      .slice(0, 25);
  }, [dataRows, effectiveLabelCol, effectiveValueCol]);

  const config: ChartConfig = {
    value: { label: header[effectiveValueCol ?? 0] || "Value", color: "var(--chart-1)" },
  };

  const empty = !sheet || numericCols.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(90vw,64rem)] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>Dashboard</DialogTitle>
          <DialogDescription>
            Live charts built from the numeric columns in a sheet — picks up edits as you make them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <Select
            value={String(sheetIndex)}
            onValueChange={(v) => {
              setSheetIndex(Number(v));
              setLabelCol(null);
              setValueCol(null);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sheet" />
            </SelectTrigger>
            <SelectContent>
              {sheets.map((s, i) => (
                <SelectItem key={`${s.name}-${i}`} value={String(i)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!empty && (
            <>
              <Select
                value={String(effectiveLabelCol)}
                onValueChange={(v) => setLabelCol(Number(v))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {labelOptions.map((c) => (
                    <SelectItem key={c} value={String(c)}>
                      {header[c] || `Column ${c + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                {...(effectiveValueCol !== null ? { value: String(effectiveValueCol) } : {})}
                onValueChange={(v) => setValueCol(Number(v))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Value" />
                </SelectTrigger>
                <SelectContent>
                  {numericCols.map((c) => (
                    <SelectItem key={c} value={String(c)}>
                      {header[c] || `Column ${c + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="ml-auto flex gap-1">
                <Button
                  size="sm"
                  variant={kind === "bar" ? "default" : "outline"}
                  onClick={() => setKind("bar")}
                >
                  <BarChart3 className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant={kind === "line" ? "default" : "outline"}
                  onClick={() => setKind("line")}
                >
                  <LineChartIcon className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant={kind === "pie" ? "default" : "outline"}
                  onClick={() => setKind("pie")}
                >
                  <PieChartIcon className="size-4" />
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto py-4">
          {empty ? (
            <p className="text-sm text-muted-foreground">
              No numeric columns found in this sheet — pick another sheet, or a sheet with a data
              table (a header row followed by number columns) to chart.
            </p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rows to chart with the current picks.
            </p>
          ) : (
            <ChartContainer config={config} className="h-[26rem] w-full">
              {kind === "bar" ? (
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--chart-1)" radius={4} />
                </BarChart>
              ) : kind === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={chartData} dataKey="value" nameKey="label" outerRadius={140} label>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              )}
            </ChartContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
