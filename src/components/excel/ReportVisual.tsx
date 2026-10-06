import { Maximize2, Minimize2, Trash2 } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  formatValue,
  measureFormat,
  measureLabel,
  runVisual,
  visualTitle,
  type DataModel,
  type FieldFormat,
  type Filters,
  type Visual,
} from "@/lib/report-model";
import { cn } from "@/lib/utils";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];

type Props = {
  visual: Visual;
  model: DataModel;
  filters: Filters;
  selected: boolean;
  onSelect: () => void;
  onToggleFilter: (field: string, value: string, additive: boolean) => void;
  onRemove: () => void;
  onResize: () => void;
};

function TooltipBox({
  active,
  payload,
  label,
  formats,
  names,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; payload?: Record<string, unknown> }[];
  label?: string;
  formats: Record<string, FieldFormat>;
  names: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const title = label ?? (payload[0]?.payload?.["label"] as string | undefined);
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {payload.map((p, i) => {
        const key = String(p.dataKey ?? "");
        return (
          <p key={i} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{names[key] ?? key}</span>
            <span className="font-medium tabular-nums">
              {formatValue(p.value ?? null, formats[key] ?? "number")}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function ReportVisual({
  visual,
  model,
  filters,
  selected,
  onSelect,
  onToggleFilter,
  onRemove,
  onResize,
}: Props) {
  const result = useMemo(() => runVisual(visual, model, filters), [visual, model, filters]);
  const title = visualTitle(visual, model);
  const category = visual.category ? model.fields.get(visual.category) : undefined;
  const picked = category ? (filters[category.id] ?? []) : [];
  const formats: Record<string, FieldFormat> = {};
  const names: Record<string, string> = {};
  const config: ChartConfig = {};
  visual.values.forEach((v, i) => {
    const k = `v${i}`;
    formats[k] = measureFormat(v, model);
    names[k] = measureLabel(v, model);
    config[k] = { label: names[k], color: PALETTE[i % PALETTE.length]! };
  });
  const dim = (label: string) => picked.length > 0 && !picked.includes(label);
  const click = (label: string | undefined, e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    if (!category || !label) return;
    onToggleFilter(category.id, label, !!(e?.ctrlKey || e?.metaKey || e?.shiftKey));
  };
  const k0 = result?.keys[0] ?? "v0";
  const compact = (k: string) => (v: number) => formatValue(v, formats[k] ?? "number", true);
  const rows = result?.rows ?? [];
  const tooltip = <Tooltip content={<TooltipBox formats={formats} names={names} />} />;

  let body: React.ReactNode;
  if (!result) {
    body = (
      <p className="p-4 text-xs text-muted-foreground">
        Pick a value field in the Visualizations pane to draw this visual.
      </p>
    );
  } else if (visual.type === "card") {
    body = (
      <div className="flex h-full flex-col justify-center px-4">
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {formatValue(result.total[k0] ?? null, formats[k0] ?? "number", true)}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{names[k0]}</p>
        {visual.values[1] && (
          <p className="mt-2 text-xs text-muted-foreground">
            {names["v1"]}:{" "}
            <span className="font-medium text-foreground">
              {formatValue(result.total["v1"] ?? null, formats["v1"] ?? "number", true)}
            </span>
          </p>
        )}
      </div>
    );
  } else if (visual.type === "table") {
    body = (
      <div className="h-full overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted text-left">
            <tr>
              <th className="px-3 py-1.5 font-semibold">{category?.name ?? ""}</th>
              {result.keys.map((k) => (
                <th key={k} className="px-3 py-1.5 text-right font-semibold">
                  {names[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                onClick={(e) => click(r.label, e)}
                className={cn(
                  "cursor-pointer border-b border-border/60 hover:bg-accent",
                  picked.includes(r.label) && "bg-accent font-medium",
                  dim(r.label) && "opacity-40",
                )}
              >
                <td className="px-3 py-1">{r.label}</td>
                {result.keys.map((k) => (
                  <td key={k} className="px-3 py-1 text-right tabular-nums">
                    {formatValue(r[k] as number | null, formats[k] ?? "number")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {category && (
            <tfoot className="sticky bottom-0 bg-muted font-semibold">
              <tr>
                <td className="px-3 py-1.5">Total</td>
                {result.keys.map((k) => (
                  <td key={k} className="px-3 py-1.5 text-right tabular-nums">
                    {formatValue(result.total[k] ?? null, formats[k] ?? "number")}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  } else if (rows.length === 0) {
    body = <p className="p-4 text-xs text-muted-foreground">No data for the current filters.</p>;
  } else if (visual.type === "pie" || visual.type === "donut") {
    body = (
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <PieChart>
          {tooltip}
          <Pie
            data={rows.slice(0, 12)}
            dataKey={k0}
            nameKey="label"
            innerRadius={visual.type === "donut" ? "55%" : 0}
            outerRadius="80%"
            paddingAngle={visual.type === "donut" ? 2 : 0}
            onClick={(d: { label?: string }, _i: number, e: React.MouseEvent) => click(d.label, e)}
            className="cursor-pointer"
          >
            {rows.slice(0, 12).map((r, i) => (
              <Cell
                key={r.label}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={dim(r.label) ? 0.25 : 1}
              />
            ))}
          </Pie>
          <Legend verticalAlign="bottom" height={28} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ChartContainer>
    );
  } else if (visual.type === "scatter") {
    const k1 = result.keys[1] ?? k0;
    body = (
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <ScatterChart margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey={k0} name={names[k0]} tickFormatter={compact(k0)} fontSize={11} />
          <YAxis type="number" dataKey={k1} name={names[k1]} tickFormatter={compact(k1)} fontSize={11} width={56} />
          <ZAxis range={[60, 60]} />
          {tooltip}
          <Scatter
            data={rows}
            fill="var(--chart-1)"
            onClick={(d: { label?: string }) => click(d.label)}
            className="cursor-pointer"
          >
            {rows.map((r) => (
              <Cell key={r.label} fillOpacity={dim(r.label) ? 0.2 : 0.85} />
            ))}
          </Scatter>
        </ScatterChart>
      </ChartContainer>
    );
  } else if (visual.type === "line" || visual.type === "area") {
    const Chart = visual.type === "line" ? LineChart : AreaChart;
    body = (
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <Chart
          data={rows}
          margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
          onClick={(s: { activeLabel?: string }) => click(s?.activeLabel)}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={compact(k0)} width={56} />
          {tooltip}
          {result.keys.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
          {result.keys.map((k, i) =>
            visual.type === "line" ? (
              <Line
                key={k}
                dataKey={k}
                name={names[k]}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={rows.length <= 24}
              />
            ) : (
              <Area
                key={k}
                dataKey={k}
                name={names[k]}
                stroke={PALETTE[i % PALETTE.length]}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={0.18}
                strokeWidth={2}
              />
            ),
          )}
        </Chart>
      </ChartContainer>
    );
  } else {
    const horizontal = visual.type === "bar";
    body = (
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <BarChart
          data={rows}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
        >
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} tickFormatter={compact(k0)} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={110}
                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval="preserveStartEnd"
                tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={compact(k0)} width={56} />
            </>
          )}
          {tooltip}
          {result.keys.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
          {result.keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={names[k]}
              fill={PALETTE[i % PALETTE.length]}
              radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              className="cursor-pointer"
              onClick={(d: { label?: string }, _i: number, e: React.MouseEvent) => click(d.label, e)}
            >
              {rows.map((r) => (
                <Cell key={r.label} fillOpacity={dim(r.label) ? 0.25 : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    );
  }

  const span =
    visual.size === "s"
      ? "col-span-12 sm:col-span-6 lg:col-span-3"
      : visual.size === "l"
        ? "col-span-12"
        : "col-span-12 lg:col-span-6";
  const height = visual.type === "card" ? "h-32" : visual.size === "l" ? "h-96" : "h-80";

  return (
    <section
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow",
        span,
        height,
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:shadow-md",
      )}
      aria-label={title}
    >
      <header className="flex shrink-0 items-center gap-1 px-3 pt-2">
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{title}</h3>
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label={visual.size === "l" ? "Make smaller" : "Make larger"}
            onClick={(e) => {
              e.stopPropagation();
              onResize();
            }}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {visual.size === "l" ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button
            type="button"
            aria-label="Remove visual"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 p-1">{body}</div>
    </section>
  );
}
