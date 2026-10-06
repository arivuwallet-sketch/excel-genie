import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart as AreaIcon,
  BarChart3,
  BarChartHorizontal,
  CloudUpload,
  Database,
  Download,
  FilterX,
  Hash,
  LineChart as LineIcon,
  Loader2,
  MessageSquareText,
  PieChart as PieIcon,
  Plus,
  ScatterChart as ScatterIcon,
  Sigma,
  SlidersHorizontal,
  Table2,
  Type,
  Wand2,
  X,
  CircleDot,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ReportVisual } from "@/components/excel/ReportVisual";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { askReportQuestion } from "@/lib/report.functions";
import {
  AGG_LABELS,
  autoPage,
  buildDataModel,
  defaultAgg,
  distinctValues,
  formatValue,
  labelFormat,
  makeVisual,
  measureFormat,
  measureLabel,
  newId,
  runVisual,
  sanitizePages,
  VISUAL_TYPES,
  visualTitle,
  type Agg,
  type DataModel,
  type Field,
  type Filters,
  type ReportPage,
  type Visual,
  type VisualType,
} from "@/lib/report-model";
import { parseQuestion } from "@/lib/report-qa";
import { downloadWorkbook, type Sheet } from "@/lib/spreadsheet";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  sheets: Sheet[];
  aiAvailable: boolean;
  onPublish: () => void;
};

const STORAGE_KEY = "excelgpt.powerbi.report.v1";

const TYPE_ICONS: Record<VisualType, typeof BarChart3> = {
  card: Hash,
  column: BarChart3,
  bar: BarChartHorizontal,
  line: LineIcon,
  area: AreaIcon,
  pie: PieIcon,
  donut: CircleDot,
  table: Table2,
  scatter: ScatterIcon,
};

function FieldIcon({ field }: { field: Field }) {
  if (field.kind === "number") return <Sigma className="size-3.5 text-primary" />;
  if (field.kind === "date") return <Calendar className="size-3.5 text-muted-foreground" />;
  return <Type className="size-3.5 text-muted-foreground" />;
}

function Slicer({
  field,
  model,
  selected,
  onChange,
  onRemove,
}: {
  field: Field;
  model: DataModel;
  selected: string[];
  onChange: (values: string[]) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => distinctValues(field, model), [field, model]);
  const shown = all.filter((v) => v.toLowerCase().includes(query.toLowerCase())).slice(0, 300);
  const label =
    selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 max-w-[15rem] items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs",
            selected.length ? "border-primary text-foreground" : "border-border text-muted-foreground",
          )}
        >
          <span className="font-semibold text-foreground">{field.name}:</span>
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex items-center gap-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${field.name}`}
            className="h-7 text-xs"
          />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange([])}>
            Clear
          </Button>
        </div>
        <div className="mt-2 max-h-64 space-y-0.5 overflow-auto">
          {shown.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent">
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, v] : selected.filter((s) => s !== v))
                }
                className="accent-[var(--primary)]"
              />
              <span className="truncate">{v}</span>
            </label>
          ))}
          {shown.length === 0 && <p className="px-1.5 py-2 text-xs text-muted-foreground">No values</p>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-2 w-full rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
        >
          Remove slicer
        </button>
      </PopoverContent>
    </Popover>
  );
}

function FormatPane({
  visual,
  model,
  onChange,
  onClose,
}: {
  visual: Visual;
  model: DataModel;
  onChange: (v: Visual) => void;
  onClose: () => void;
}) {
  const table = model.tables.find((t) => t.name === visual.table);
  const fields = table?.fields ?? [];
  const set = (patch: Partial<Visual>) => onChange({ ...visual, ...patch });
  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Visualizations
        </h2>
        <button type="button" aria-label="Close pane" onClick={onClose} className="rounded p-1 hover:bg-accent">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="space-y-4 p-3 text-xs">
        <div className="grid grid-cols-5 gap-1">
          {VISUAL_TYPES.map(({ type, label }) => {
            const Icon = TYPE_ICONS[type];
            return (
              <button
                key={type}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => set({ type, size: type === "card" ? "s" : visual.size === "s" ? "m" : visual.size })}
                className={cn(
                  "flex h-9 items-center justify-center rounded border",
                  visual.type === type ? "border-primary bg-accent text-primary" : "border-border hover:bg-accent",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
        <label className="block">
          <span className="font-medium">Title</span>
          <Input
            value={visual.title}
            placeholder={visualTitle({ ...visual, title: "" }, model)}
            onChange={(e) => set({ title: e.target.value })}
            className="mt-1 h-8 text-xs"
          />
        </label>
        {visual.type !== "card" && (
          <label className="block">
            <span className="font-medium">{visual.type === "scatter" ? "Details (points)" : "Axis / Category"}</span>
            <select
              value={visual.category ?? ""}
              onChange={(e) => set({ category: e.target.value || null })}
              className="mt-1 w-full rounded border border-border bg-background p-1.5"
            >
              <option value="">None (total)</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <span className="font-medium">Values</span>
          <div className="mt-1 space-y-1.5">
            {visual.values.map((v, i) => (
              <div key={`${v.field}-${i}`} className="rounded border border-border p-1.5">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">{model.fields.get(v.field)?.name ?? "Missing"}</span>
                  <button
                    type="button"
                    aria-label="Remove value"
                    onClick={() => set({ values: visual.values.filter((_, j) => j !== i) })}
                    className="rounded p-0.5 hover:bg-accent"
                  >
                    <X className="size-3" />
                  </button>
                </div>
                <select
                  value={v.agg}
                  onChange={(e) =>
                    set({
                      values: visual.values.map((x, j) => (j === i ? { ...x, agg: e.target.value as Agg } : x)),
                    })
                  }
                  className="mt-1 w-full rounded border border-border bg-background p-1"
                >
                  {(Object.keys(AGG_LABELS) as Agg[])
                    .filter((a) => model.fields.get(v.field)?.kind === "number" || a === "count" || a === "distinct")
                    .map((a) => (
                      <option key={a} value={a}>
                        {AGG_LABELS[a]}
                      </option>
                    ))}
                </select>
              </div>
            ))}
            <select
              value=""
              onChange={(e) => {
                const f = model.fields.get(e.target.value);
                if (f) set({ values: [...visual.values, { field: f.id, agg: defaultAgg(f) }] });
              }}
              className="w-full rounded border border-dashed border-border bg-background p-1.5 text-muted-foreground"
            >
              <option value="">+ Add a value…</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.kind === "number" ? "" : " (count)"}
                </option>
              ))}
            </select>
          </div>
        </div>
        {visual.type !== "card" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="font-medium">Sort</span>
              <select
                value={visual.sort}
                onChange={(e) => set({ sort: e.target.value as Visual["sort"] })}
                className="mt-1 w-full rounded border border-border bg-background p-1.5"
              >
                <option value="value-desc">Largest first</option>
                <option value="value-asc">Smallest first</option>
                <option value="label">By axis</option>
              </select>
            </label>
            <label className="block">
              <span className="font-medium">Top N</span>
              <Input
                type="number"
                min={0}
                max={500}
                value={visual.topN ?? ""}
                placeholder="All"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  set({ topN: Number.isFinite(n) && n > 0 ? Math.min(500, Math.round(n)) : null });
                }}
                className="mt-1 h-8 text-xs"
              />
            </label>
          </div>
        )}
        {(visual.pins ?? []).length > 0 && (
          <div>
            <span className="font-medium">Filters on this visual</span>
            <div className="mt-1 space-y-1">
              {(visual.pins ?? []).map((p, i) => (
                <div key={`${p.field}-${i}`} className="flex items-center gap-1 rounded bg-accent px-2 py-1">
                  <span className="min-w-0 flex-1 truncate">
                    {model.fields.get(p.field)?.name}: {p.values.join(", ")}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove visual filter"
                    onClick={() => set({ pins: (visual.pins ?? []).filter((_, j) => j !== i) })}
                    className="rounded p-0.5 hover:bg-background"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <label className="block">
          <span className="font-medium">Size</span>
          <select
            value={visual.size}
            onChange={(e) => set({ size: e.target.value as Visual["size"] })}
            className="mt-1 w-full rounded border border-border bg-background p-1.5"
          >
            <option value="s">Small</option>
            <option value="m">Medium</option>
            <option value="l">Full width</option>
          </select>
        </label>
      </div>
    </aside>
  );
}

export function PowerBiWorkspace({ open, onClose, sheets, aiAvailable, onPublish }: Props) {
  const model = useMemo(() => buildDataModel(sheets), [sheets]);
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [fieldQuery, setFieldQuery] = useState("");
  const loaded = useRef(false);
  const ask = useServerFn(askReportQuestion);

  const autoBuild = () => {
    const next = model.tables.slice(0, 8).map((t) => autoPage(t));
    setPages(next);
    setPageId(next[0]?.id ?? null);
    setFilters({});
    setSelectedId(null);
    return next;
  };

  // Load the saved report once per open; otherwise auto-build from the workbook.
  useEffect(() => {
    if (!open) return;
    if (!loaded.current) {
      loaded.current = true;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as ReportPage[]) : [];
        const clean = sanitizePages(Array.isArray(saved) ? saved : [], model).filter(
          (p) => p.visuals.length > 0,
        );
        if (clean.length) {
          setPages(clean);
          setPageId(clean[0]!.id);
          return;
        }
      } catch {
        // ignore corrupt saved report
      }
      autoBuild();
      return;
    }
    // Workbook changed while open: drop visuals whose fields disappeared.
    setPages((p) => {
      const clean = sanitizePages(p, model);
      return clean.some((x) => x.visuals.length) ? clean : model.tables.slice(0, 8).map((t) => autoPage(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the model changes
  }, [open, model]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    } catch {
      // storage full: the report still works for this session
    }
  }, [pages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-radix-popper-content-wrapper]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const selected = page?.visuals.find((v) => v.id === selectedId) ?? null;
  const activeFilters = Object.entries(filters).filter(([, v]) => v.length > 0);

  const updatePage = (fn: (p: ReportPage) => ReportPage) =>
    setPages((all) => all.map((p) => (p.id === page?.id ? fn(p) : p)));
  const updateVisual = (v: Visual) =>
    updatePage((p) => ({ ...p, visuals: p.visuals.map((x) => (x.id === v.id ? v : x)) }));
  const addVisual = (v: Visual) => {
    if (!page) {
      const p: ReportPage = { id: newId("p"), name: "Page 1", visuals: [v], slicers: [] };
      setPages([p]);
      setPageId(p.id);
    } else updatePage((p) => ({ ...p, visuals: [v, ...p.visuals] }));
    setSelectedId(v.id);
  };
  const defaultTable = () =>
    model.tables.find((t) => page?.visuals.some((v) => v.table === t.name)) ?? model.tables[0];

  const toggleFilter = (field: string, value: string, additive: boolean) =>
    setFilters((f) => {
      const cur = f[field] ?? [];
      const has = cur.includes(value);
      const next = additive ? (has ? cur.filter((x) => x !== value) : [...cur, value]) : has && cur.length === 1 ? [] : [value];
      return { ...f, [field]: next };
    });

  const onFieldClick = (field: Field) => {
    if (selected && selected.table === field.table) {
      if (field.kind === "number") {
        if (!selected.values.some((v) => v.field === field.id))
          updateVisual({ ...selected, values: [...selected.values, { field: field.id, agg: defaultAgg(field) }] });
      } else updateVisual({ ...selected, category: field.id, type: selected.type === "card" ? "column" : selected.type, size: selected.type === "card" ? "m" : selected.size });
      return;
    }
    const table = model.tables.find((t) => t.name === field.table)!;
    if (field.kind === "number")
      addVisual(makeVisual({ table: table.name, type: "card", values: [{ field: field.id, agg: defaultAgg(field) }] }));
    else {
      const m = table.fields.find((f) => f.kind === "number");
      addVisual(
        makeVisual({
          table: table.name,
          type: field.kind === "date" || /period|month|year/i.test(field.name) ? "line" : field.distinct > 12 ? "bar" : "column",
          category: field.id,
          values: [m ? { field: m.id, agg: defaultAgg(m) } : { field: field.id, agg: "count" }],
          sort: field.kind === "date" || /period|month|year/i.test(field.name) ? "label" : "value-desc",
          topN: field.distinct > 20 ? 20 : null,
        }),
      );
    }
  };

  const addEmpty = (type: VisualType) => {
    const t = defaultTable();
    if (!t) {
      toast.info("Add a data table to the workbook first.");
      return;
    }
    const m = t.fields.find((f) => f.kind === "number");
    const c = t.fields.find((f) => f.kind !== "number");
    addVisual(
      makeVisual({
        table: t.name,
        type,
        category: type === "card" ? null : (c?.id ?? null),
        values: m ? [{ field: m.id, agg: defaultAgg(m) }] : c ? [{ field: c.id, agg: "count" }] : [],
      }),
    );
  };

  const runQuestion = async () => {
    const q = question.trim();
    if (!q || asking) return;
    if (model.tables.length === 0) {
      toast.info("There is no data table in this workbook yet.");
      return;
    }
    const local = parseQuestion(q, model, defaultTable()?.name);
    if (local) {
      addVisual(local);
      setQuestion("");
      return;
    }
    if (!aiAvailable) {
      toast.info("Try naming a column from the Fields list, e.g. “Revenue by Region”.");
      return;
    }
    setAsking(true);
    try {
      const res = await ask({
        data: {
          question: q,
          tables: model.tables.map((t) => ({
            name: t.name,
            fields: t.fields.slice(0, 80).map((f) => ({
              id: f.id,
              name: f.name,
              kind: f.kind,
              samples: distinctValues(f, model)
                .slice(0, f.kind === "category" ? 40 : 5)
                .map((s) => s.slice(0, 60)),
            })),
          })),
        },
      });
      if (!res.ok) return void toast.error(res.message);
      const v = res.visual;
      const table = model.tables.find((t) => t.name === v.table);
      const values = v.values
        .filter((x) => table?.fields.some((f) => f.id === x.field))
        .map((x) => ({ field: x.field, agg: (x.agg in AGG_LABELS ? x.agg : "sum") as Agg }));
      if (!table || values.length === 0) return void toast.error("The AI picked fields that are not in your data. Try rephrasing.");
      const type = (VISUAL_TYPES.some((t) => t.type === v.type) ? v.type : "column") as VisualType;
      addVisual(
        makeVisual({
          table: table.name,
          type,
          title: v.title.slice(0, 120),
          category: v.category && table.fields.some((f) => f.id === v.category) ? v.category : null,
          values,
          sort: (["value-desc", "value-asc", "label"].includes(v.sort) ? v.sort : "value-desc") as Visual["sort"],
          topN: v.topN && v.topN > 0 ? Math.min(500, v.topN) : null,
          pins: v.pins
            .filter((p) => table.fields.some((f) => f.id === p.field) && p.values.length > 0)
            .map((p) => ({ field: p.field, values: p.values.slice(0, 50) })),
          format:
            table.shape !== "list" && v.pins.length === 1 && v.pins[0]!.values.length === 1
              ? labelFormat(v.pins[0]!.values[0]!, [])
              : null,
        }),
      );
      if (v.answer) toast.success(v.answer.slice(0, 200));
      setQuestion("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Q&A failed.");
    } finally {
      setAsking(false);
    }
  };

  const exportData = () => {
    if (!page?.visuals.length) {
      toast.info("This page has no visuals to export.");
      return;
    }
    const used = new Set<string>();
    const out: Sheet[] = page.visuals.map((v, i) => {
      const result = runVisual(v, model, filters);
      const cat = v.category ? model.fields.get(v.category) : undefined;
      const header = [cat?.name ?? "Total", ...v.values.map((x) => measureLabel(x, model))];
      const rows = (result?.rows ?? []).map((r) => [
        r.label,
        ...(result?.keys ?? []).map((k) => (r[k] === null || r[k] === undefined ? "" : String(r[k]))),
      ]);
      let name = visualTitle(v, model).replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || `Visual ${i + 1}`;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${name.slice(0, 26)} ${n}`;
      used.add(name.toLowerCase());
      return { name, rows: [[visualTitle(v, model)], header, ...rows] };
    });
    downloadWorkbook(out, "xlsx", `${page.name}-report`);
  };

  const filteredTables = model.tables
    .map((t) => ({
      t,
      fields: t.fields.filter((f) => f.name.toLowerCase().includes(fieldQuery.toLowerCase())),
    }))
    .filter((x) => x.fields.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground" role="dialog" aria-label="Power BI workspace">
      {/* Ribbon */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-chart-3 text-primary-foreground">
          <BarChart3 className="size-4" />
        </span>
        <div className="mr-2">
          <h1 className="text-sm font-semibold leading-tight">Power BI workspace</h1>
          <p className="text-[11px] text-muted-foreground">
            {model.tables.length} table{model.tables.length === 1 ? "" : "s"} · live from your workbook
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="size-4" /> Add visual
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {VISUAL_TYPES.map(({ type, label }) => {
              const Icon = TYPE_ICONS[type];
              return (
                <DropdownMenuItem key={type} onClick={() => addEmpty(type)}>
                  <Icon className="size-4" /> {label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" onClick={() => { autoBuild(); toast.success("Report rebuilt from your data"); }}>
          <Wand2 className="size-4" /> Auto-build report
        </Button>
        <Button size="sm" variant="outline" disabled={activeFilters.length === 0} onClick={() => setFilters({})}>
          <FilterX className="size-4" /> Clear filters
        </Button>
        <Button size="sm" variant="outline" onClick={exportData}>
          <Download className="size-4" /> Export data
        </Button>
        <Button size="sm" variant="outline" onClick={onPublish} title="Send the workbook to your Power BI online workspace">
          <CloudUpload className="size-4" /> Publish to Power BI
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose} aria-label="Close Power BI workspace">
          <X className="size-4" /> Close
        </Button>
      </header>

      {/* Q&A */}
      <form
        className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runQuestion();
        }}
      >
        <MessageSquareText className="size-4 shrink-0 text-primary" />
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your data — e.g. “top 5 products by revenue”, “average margin over time as a line”"
          className="h-8 flex-1 bg-card text-sm"
          aria-label="Ask a question about your data"
        />
        <Button size="sm" type="submit" disabled={asking || !question.trim()}>
          {asking ? <Loader2 className="size-4 animate-spin" /> : "Ask"}
        </Button>
      </form>

      <div className="flex min-h-0 flex-1">
        {/* Fields pane */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
          <div className="border-b border-border px-3 py-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Database className="size-3.5" /> Fields
            </h2>
            <Input
              value={fieldQuery}
              onChange={(e) => setFieldQuery(e.target.value)}
              placeholder="Search fields"
              className="mt-2 h-7 text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
            {filteredTables.length === 0 && (
              <p className="p-2 text-muted-foreground">
                No data tables found. A table is a header row followed by rows of values.
              </p>
            )}
            {filteredTables.map(({ t, fields }) => (
              <div key={t.name} className="mb-3">
                <p className="flex items-center gap-1.5 px-1 py-1 font-semibold">
                  <Table2 className="size-3.5 text-primary" />
                  <span className="truncate">{t.name}</span>
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground">{t.rows.length} rows</span>
                </p>
                {t.unpivoted && (
                  <p className="px-1 pb-1 text-[10px] text-muted-foreground">Periods unpivoted into rows</p>
                )}
                {fields.map((f) => (
                  <div key={f.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => onFieldClick(f)}
                      title={selected ? "Add to the selected visual" : "Create a visual from this field"}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-accent"
                    >
                      <FieldIcon field={f} />
                      <span className="truncate">{f.name}</span>
                    </button>
                    {f.kind !== "number" && page && !page.slicers.includes(f.id) && (
                      <button
                        type="button"
                        aria-label={`Add ${f.name} slicer`}
                        title="Add as slicer"
                        onClick={() => updatePage((p) => ({ ...p, slicers: [...p.slicers, f.id] }))}
                        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                      >
                        <SlidersHorizontal className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col">
          {page && (page.slicers.length > 0 || activeFilters.length > 0) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
              {page.slicers.map((id) => {
                const f = model.fields.get(id);
                if (!f) return null;
                return (
                  <Slicer
                    key={id}
                    field={f}
                    model={model}
                    selected={filters[id] ?? []}
                    onChange={(vals) => setFilters((x) => ({ ...x, [id]: vals }))}
                    onRemove={() => {
                      updatePage((p) => ({ ...p, slicers: p.slicers.filter((s) => s !== id) }));
                      setFilters((x) => ({ ...x, [id]: [] }));
                    }}
                  />
                );
              })}
              {activeFilters
                .filter(([id]) => !page.slicers.includes(id))
                .map(([id, vals]) => (
                  <span key={id} className="flex h-8 items-center gap-1 rounded-md bg-accent px-2.5 text-xs">
                    <span className="font-semibold">{model.fields.get(id)?.name}:</span>
                    <span className="max-w-[10rem] truncate">{vals.join(", ")}</span>
                    <button
                      type="button"
                      aria-label="Remove filter"
                      onClick={() => setFilters((x) => ({ ...x, [id]: [] }))}
                      className="rounded p-0.5 hover:bg-background"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}
          <div
            className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            {!page || page.visuals.length === 0 ? (
              <div className="mx-auto mt-16 max-w-md text-center">
                <BarChart3 className="mx-auto size-10 text-muted-foreground" />
                <h2 className="mt-3 text-sm font-semibold">
                  {model.tables.length ? "This page is empty" : "No data to report on yet"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {model.tables.length
                    ? "Click a field on the left, ask a question above, or auto-build a full report."
                    : "Load a template or upload a file with a header row and rows of values, then come back."}
                </p>
                {model.tables.length > 0 && (
                  <Button size="sm" className="mt-4" onClick={autoBuild}>
                    <Wand2 className="size-4" /> Auto-build report
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-3">
                {page.visuals.map((v) => (
                  <ReportVisual
                    key={v.id}
                    visual={v}
                    model={model}
                    filters={filters}
                    selected={v.id === selectedId}
                    onSelect={() => setSelectedId(v.id)}
                    onToggleFilter={toggleFilter}
                    onRemove={() => {
                      updatePage((p) => ({ ...p, visuals: p.visuals.filter((x) => x.id !== v.id) }));
                      if (selectedId === v.id) setSelectedId(null);
                    }}
                    onResize={() =>
                      updateVisual({ ...v, size: v.size === "l" ? (v.type === "card" ? "s" : "m") : v.size === "s" ? "m" : "l" })
                    }
                  />
                ))}
              </div>
            )}
          </div>
          {/* Page tabs */}
          <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-card px-2 py-1.5">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPageId(p.id);
                  setSelectedId(null);
                }}
                onDoubleClick={() => {
                  const name = window.prompt("Rename page", p.name)?.trim();
                  if (name) setPages((all) => all.map((x) => (x.id === p.id ? { ...x, name: name.slice(0, 40) } : x)));
                }}
                className={cn(
                  "group flex max-w-[12rem] items-center gap-1 rounded px-3 py-1 text-xs",
                  p.id === page?.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <span className="truncate">{p.name}</span>
                {pages.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Delete ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPages((all) => all.filter((x) => x.id !== p.id));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setPages((all) => all.filter((x) => x.id !== p.id));
                    }}
                    className="rounded opacity-60 hover:opacity-100"
                  >
                    <X className="size-3" />
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              aria-label="Add page"
              onClick={() => {
                const p: ReportPage = { id: newId("p"), name: `Page ${pages.length + 1}`, visuals: [], slicers: [] };
                setPages((all) => [...all, p]);
                setPageId(p.id);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <Plus className="size-4" />
            </button>
            {selected && (
              <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
                Selected: {visualTitle(selected, model)} ·{" "}
                {formatValue(runVisual(selected, model, filters)?.total["v0"] ?? null, selected.values[0] ? measureFormat(selected.values[0], model, selected) : "number", true)}
              </span>
            )}
          </nav>
        </main>

        {selected && (
          <FormatPane visual={selected} model={model} onChange={updateVisual} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}
