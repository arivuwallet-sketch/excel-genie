import { calculateWorkbook } from "./calculation.ts";
import type { Sheet } from "./spreadsheet";
import { numericValue } from "./workbook-intelligence.ts";

/**
 * Power BI–style semantic model built from the live workbook: each sheet with a data table becomes
 * a model table (formulas are calculated first), wide period layouts (months/years as columns) are
 * unpivoted into Line item × Period × Value like Power Query, and same-named fields across tables
 * act as relationships so a slicer on "Region" filters every table that has a Region column.
 */

export type FieldKind = "category" | "number" | "date";
export type FieldFormat = "currency" | "percent" | "count" | "number" | "text";
export type Field = {
  id: string;
  table: string;
  name: string;
  col: number;
  kind: FieldKind;
  format: FieldFormat;
  distinct: number;
};
export type Cell = string | number | null;
/** list = one record per row; summary = one KPI per row (mixed units); matrix = unpivoted statement. */
export type TableShape = "list" | "summary" | "matrix";
export type ModelTable = {
  name: string;
  fields: Field[];
  rows: Cell[][];
  unpivoted: boolean;
  shape: TableShape;
};
export type DataModel = { tables: ModelTable[]; fields: Map<string, Field> };

export type Agg = "sum" | "avg" | "count" | "distinct" | "min" | "max";
export type VisualType =
  "card" | "column" | "bar" | "line" | "area" | "pie" | "donut" | "table" | "scatter";
export type VisualValue = { field: string; agg: Agg };
export type Visual = {
  id: string;
  type: VisualType;
  title: string;
  table: string;
  category: string | null;
  values: VisualValue[];
  sort: "value-desc" | "value-asc" | "label";
  topN: number | null;
  size: "s" | "m" | "l";
  /** Visual-level filter (e.g. a card showing only the "Revenue" line). */
  pins?: { field: string; values: string[] }[] | null;
  /** Number format override when one field mixes units (KPI lists, statements). */
  format?: FieldFormat | null;
};
export type ReportPage = { id: string; name: string; visuals: Visual[]; slicers: string[] };
export type Filters = Record<string, string[]>;

export const VISUAL_TYPES: { type: VisualType; label: string }[] = [
  { type: "card", label: "Card" },
  { type: "column", label: "Column chart" },
  { type: "bar", label: "Bar chart" },
  { type: "line", label: "Line chart" },
  { type: "area", label: "Area chart" },
  { type: "pie", label: "Pie chart" },
  { type: "donut", label: "Donut chart" },
  { type: "table", label: "Table" },
  { type: "scatter", label: "Scatter chart" },
];
export const AGG_LABELS: Record<Agg, string> = {
  sum: "Sum",
  avg: "Average",
  count: "Count",
  distinct: "Count (distinct)",
  min: "Minimum",
  max: "Maximum",
};

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const PERIOD_RE = new RegExp(
  `^(?:(?:fy|cy)\\s*'?\\d{2,4}[ae]?|'?\\d{4}[ae]?|(?:${MONTHS})[a-z]*(?:[\\s\\-']*\\d{2,4})?|q[1-4](?:[\\s\\-']*(?:fy)?\\d{2,4})?|(?:h[12])(?:[\\s\\-']*\\d{2,4})?|(?:month|year|yr|period|week|wk|m|y|p|w)\\s*\\d{1,3}|\\d{4}[\\s\\-/](?:q[1-4]|\\d{1,2}|(?:${MONTHS})[a-z]*))$`,
  "i",
);
const TOTAL_RE = /^(?:sub)?total\b|^grand total|^total\s|^sum\b/i;
const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}(?:[T ].*)?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const PERCENT_NAME =
  /%|\b(?:rate|margin|growth|yield|share|ratio|churn|pct|percent|irr|return|roi|roe|roa|cagr|wacc|retention|conversion|utili[sz]ation|occupancy|probability|weight|change|delta|var)\b|\bvs\.?\s/i;
const MONEY_NAME =
  /\$|£|€|\b(?:revenue|sales|cost|costs|price|amount|profit|income|expense|expenses|cash|balance|budget|spend|ebitda|ebit|salary|pay|fee|fees|arr|mrr|ltv|cac|capex|opex|debt|equity|asset|assets|liabilit\w*|value|valuation|gmv|payment|invoice|total|net|gross|margin \$|usd|eur|gbp|cogs|depreciation|amortization|d&a|tax|taxes|interest expense|deal size|aov|arpu|arpa|acv|tcv|basket|ticket|wage|rent|loan|principal|interest|dividend|nav|ffo|affo|noi)\b/i;

function isPeriodHeader(v: string) {
  const t = v.trim();
  if (!t) return false;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return true;
  return PERIOD_RE.test(t);
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "field"
  );
}

function trimRow(row: string[]) {
  return row.map((v) => (v ?? "").trim());
}

const isLabelish = (v: string) =>
  !v.startsWith("#") && (numericValue(v) === null || isPeriodHeader(v));

/**
 * Picks the best table block in a sheet: a header row of ≥2 labels followed by consecutive rows
 * carrying numbers. Scored by header width × block height so a small "Label | value" inputs block
 * at the top loses to the real data table below it.
 */
function findHeader(rows: string[][]): number {
  let best = -1,
    bestScore = 0;
  for (let r = 0; r < Math.min(rows.length - 1, 80); r++) {
    const row = trimRow(rows[r] ?? []);
    const filled = row.filter(Boolean);
    if (filled.length < 2 || !filled.every(isLabelish)) continue;
    let height = 0,
      blanks = 0;
    for (let k = r + 1; k < Math.min(rows.length, r + 400); k++) {
      const next = trimRow(rows[k] ?? []);
      if (!next.some(Boolean)) {
        if (++blanks >= 2) break;
        continue;
      }
      const hasNumber = next.some((v) => numericValue(v) !== null);
      // A blank row followed by a text-only row (section title / new header) starts a new block.
      if (blanks > 0 && !hasNumber) break;
      blanks = 0;
      if (hasNumber) height++;
    }
    if (height < 2) continue;
    const score = filled.length * Math.min(height, 60);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

function inferFormat(name: string, values: number[]): FieldFormat {
  const fractional = values.length > 0 && values.every((v) => Math.abs(v) <= 1.5);
  if (PERCENT_NAME.test(name) && (fractional || /%/.test(name))) return "percent";
  if (MONEY_NAME.test(name)) return "currency";
  if (values.length > 0 && values.every((v) => Number.isInteger(v))) return "count";
  return "number";
}

function parseCell(raw: string): Cell {
  const v = raw.trim();
  if (!v) return null;
  const n = numericValue(v) ?? (/^[+-]?\d*\.?\d+e[+-]?\d+$/i.test(v) ? Number(v) : null);
  return n === null ? v : n;
}

function buildTable(sheet: Sheet, usedNames: Set<string>): ModelTable | null {
  const rows = sheet.rows;
  const h = findHeader(rows);
  if (h < 0) return null;
  const header = trimRow(rows[h] ?? []);
  const width = Math.max(header.length, ...rows.slice(h + 1, h + 200).map((r) => r.length));
  // Data rows: until three consecutive blank rows; total/subtotal rows are excluded so sums
  // don't double count.
  const body: string[][] = [];
  let blanks = 0;
  for (let r = h + 1; r < rows.length; r++) {
    const row = trimRow(rows[r] ?? []);
    if (!row.some(Boolean)) {
      if (++blanks >= 2) break;
      continue;
    }
    if (blanks > 0 && !row.some((v) => numericValue(v) !== null)) break;
    blanks = 0;
    const firstText = row.find((v) => v && numericValue(v) === null) ?? "";
    if (TOTAL_RE.test(firstText)) continue;
    // A row that repeats the header (a second block) ends the table.
    if (row.filter((v, i) => v && v === header[i]).length >= 2) break;
    body.push(row);
  }
  if (body.length === 0) return null;

  let name = sheet.name;
  for (let i = 2; usedNames.has(name.toLowerCase()); i++) name = `${sheet.name} ${i}`;
  usedNames.add(name.toLowerCase());

  const periodCols = header.map((v, c) => (isPeriodHeader(v) ? c : -1)).filter((c) => c >= 0);
  const labelCols = Array.from({ length: width }, (_, c) => c).filter(
    (c) => !periodCols.includes(c) && body.some((r) => r[c] && numericValue(r[c]!) === null),
  );

  if (periodCols.length >= 3 && labelCols.length >= 1) {
    // Wide financial layout → unpivot.
    const lineCol = labelCols[0]!;
    const extra = labelCols.slice(1, 3);
    const out: Cell[][] = [];
    for (const row of body) {
      const label = row[lineCol];
      if (!label) continue;
      for (const pc of periodCols) {
        const n = numericValue(row[pc] ?? "");
        if (n === null) continue;
        out.push([label, header[pc]!, ...extra.map((c) => row[c] || null), n]);
      }
    }
    if (out.length === 0) return null;
    const rawLine = header[lineCol] ?? "";
    const lineName =
      !rawLine || rawLine.length > 24 || /^[^a-z]*[A-Z]{3,}[^a-z]*[A-Z]{3,}/.test(rawLine)
        ? "Line item"
        : rawLine;
    const names = [
      lineName,
      "Period",
      ...extra.map((c) => header[c] || `Column ${c + 1}`),
      "Value",
    ];
    const values = out.map((r) => r[r.length - 1] as number);
    const fields: Field[] = names.map((n, i) => ({
      id: `${slug(name)}.${slug(n)}`,
      table: name,
      name: n,
      col: i,
      kind: i === names.length - 1 ? "number" : "category",
      format: i === names.length - 1 ? inferFormat(`${sheet.name} ${lineName}`, values) : "text",
      distinct: new Set(out.map((r) => r[i])).size,
    }));
    return { name, fields, rows: out, unpivoted: true, shape: "matrix" };
  }

  const cols = Array.from({ length: width }, (_, c) => c).filter((c) =>
    body.some((r) => (r[c] ?? "") !== ""),
  );
  const seen = new Set<string>();
  const fields: Field[] = [];
  const parsed: Cell[][] = body.map((r) => cols.map((c) => parseCell(r[c] ?? "")));
  cols.forEach((c, i) => {
    let fname = header[c] || `Column ${c + 1}`;
    for (let k = 2; seen.has(fname.toLowerCase()); k++) fname = `${header[c] || "Column"} ${k}`;
    seen.add(fname.toLowerCase());
    // Calculation errors (#DIV/0!, #N/A…) don't decide a column's type.
    const cells = parsed
      .map((r) => r[i])
      .filter((v) => v !== null && !(typeof v === "string" && v.startsWith("#")));
    const nums = cells.filter((v): v is number => typeof v === "number");
    const isDate =
      cells.length > 0 &&
      cells.filter((v) => typeof v === "string" && DATE_RE.test(v)).length / cells.length >= 0.6;
    const isNumber = !isDate && cells.length > 0 && nums.length / cells.length >= 0.6;
    const yearLike =
      isNumber &&
      nums.every((n) => Number.isInteger(n) && n >= 1900 && n <= 2100) &&
      /year|yr|fy|period/i.test(fname);
    const kind: FieldKind = isDate ? "date" : isNumber && !yearLike ? "number" : "category";
    fields.push({
      id: `${slug(name)}.${slug(fname)}`,
      table: name,
      name: fname,
      col: i,
      kind,
      format: kind === "number" ? inferFormat(fname, nums) : "text",
      distinct: new Set(cells.map(String)).size,
    });
  });
  if (!fields.some((f) => f.kind === "number") && fields.length < 2) return null;
  // KPI / assumptions lists: each row is a different metric with its own unit, so adding the
  // rows up is meaningless. Detected by a unique label per row whose labels imply mixed units.
  let shape: TableShape = "list";
  const label = fields.find((f) => f.kind === "category");
  const firstNum = fields.find((f) => f.kind === "number");
  if (
    label &&
    firstNum &&
    new Set(parsed.map((r) => String(r[label.col] ?? ""))).size === parsed.length &&
    parsed.length <= 40
  ) {
    const formats = new Set(
      parsed.map((r) => {
        const v = r[firstNum.col];
        return inferFormat(String(r[label.col] ?? ""), typeof v === "number" ? [v] : []);
      }),
    );
    if (
      formats.size > 1 ||
      /kpi|metric|measure|driver|input|setting|term|assumption|parameter/i.test(label.name)
    )
      shape = "summary";
  }
  const rowsOut =
    shape === "summary"
      ? parsed.filter((r) => {
          const l = String(r[label!.col] ?? "");
          return !l.startsWith("#") && r.some((v) => typeof v === "number");
        })
      : parsed;
  return { name, fields, rows: rowsOut, unpivoted: false, shape };
}

export function buildDataModel(sheets: Sheet[]): DataModel {
  let calculated = sheets;
  try {
    calculated = calculateWorkbook(sheets).sheets;
  } catch {
    // Oversized or unsupported workbooks fall back to literal values.
  }
  const used = new Set<string>();
  const tables = calculated
    .map((s) => buildTable(s, used))
    .filter((t): t is ModelTable => t !== null);
  const fields = new Map<string, Field>();
  for (const t of tables) for (const f of t.fields) fields.set(f.id, f);
  return { tables, fields };
}

// ---------- Query engine ----------

function cellText(v: Cell) {
  return v === null ? "(Blank)" : String(v);
}

/** Rows of a table passing every filter whose field name exists in this table (relationships). */
export function filterRows(table: ModelTable, model: DataModel, filters: Filters, skip?: string) {
  const active = Object.entries(filters)
    .filter(([id, vals]) => id !== skip && vals.length > 0)
    .map(([id, vals]) => {
      const source = model.fields.get(id);
      if (!source) return null;
      const target = table.fields.find((f) => f.name.toLowerCase() === source.name.toLowerCase());
      if (!target) return null;
      if (skip && model.fields.get(skip)?.name.toLowerCase() === target.name.toLowerCase())
        return null;
      return { col: target.col, set: new Set(vals) };
    })
    .filter((x): x is { col: number; set: Set<string> } => x !== null);
  if (active.length === 0) return table.rows;
  return table.rows.filter((r) => active.every((a) => a.set.has(cellText(r[a.col] ?? null))));
}

function aggregate(values: Cell[], agg: Agg): number | null {
  if (agg === "count") return values.filter((v) => v !== null).length;
  if (agg === "distinct") return new Set(values.filter((v) => v !== null).map(String)).size;
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  if (agg === "sum") return nums.reduce((a, b) => a + b, 0);
  if (agg === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (agg === "min") return Math.min(...nums);
  return Math.max(...nums);
}

export type QueryRow = { label: string } & Record<string, number | string | null>;
export type QueryResult = {
  rows: QueryRow[];
  keys: string[];
  total: Record<string, number | null>;
};

export function valueKey(v: VisualValue, i: number) {
  return `v${i}`;
}

function periodOrder(table: ModelTable, col: number) {
  const order = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const k = cellText(r[col] ?? null);
    if (!order.has(k)) order.set(k, i);
  });
  return order;
}

export function overriddenPin(field: string, model: DataModel, filters: Filters) {
  const name = model.fields.get(field)?.name.toLowerCase();
  return Object.entries(filters).some(
    ([id, vals]) => vals.length > 0 && model.fields.get(id)?.name.toLowerCase() === name,
  );
}

/** Human-readable context for a visual's pins, reflecting slicer overrides. */
export function pinContext(visual: Visual, model: DataModel, filters: Filters): string {
  return (visual.pins ?? [])
    .map((p) => {
      const f = model.fields.get(p.field);
      if (!f) return "";
      const vals = overriddenPin(p.field, model, filters)
        ? (Object.entries(filters).find(
            ([id, v]) =>
              v.length && model.fields.get(id)?.name.toLowerCase() === f.name.toLowerCase(),
          )?.[1] ?? p.values)
        : p.values;
      return vals.length > 2 ? `${vals.length} ${f.name}s` : vals.join(", ");
    })
    .filter(Boolean)
    .join(" · ");
}

export function runVisual(visual: Visual, model: DataModel, filters: Filters): QueryResult | null {
  const table = model.tables.find((t) => t.name === visual.table);
  if (!table) return null;
  const values = visual.values
    .map((v) => ({ v, field: model.fields.get(v.field) }))
    .filter((x) => x.field && x.field.table === table.name);
  if (values.length === 0 && visual.type !== "table") return null;
  const cat = visual.category ? model.fields.get(visual.category) : undefined;
  let rows = filterRows(table, model, filters, cat?.id);
  for (const pin of visual.pins ?? []) {
    const ff = model.fields.get(pin.field);
    if (!ff || ff.table !== table.name || pin.values.length === 0) continue;
    // A slicer / cross-filter on the same field overrides the visual's default pin
    // (e.g. cards pinned to the latest period follow the period the user picks).
    if (overriddenPin(pin.field, model, filters)) continue;
    const set = new Set(pin.values);
    rows = rows.filter((r) => set.has(cellText(r[ff.col] ?? null)));
  }
  const keys = values.map((x, i) => valueKey(x.v, i));
  const total: Record<string, number | null> = {};
  values.forEach((x, i) => {
    total[keys[i]!] = aggregate(
      rows.map((r) => r[x.field!.col] ?? null),
      x.v.agg,
    );
  });
  if (!cat || cat.table !== table.name) {
    return { rows: [{ label: "Total", ...total }], keys, total };
  }
  const groups = new Map<string, Cell[][]>();
  for (const r of rows) {
    const k = cellText(r[cat.col] ?? null);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  let out: QueryRow[] = [...groups.entries()].map(([label, rs]) => {
    const row: QueryRow = { label };
    values.forEach((x, i) => {
      row[keys[i]!] = aggregate(
        rs.map((r) => r[x.field!.col] ?? null),
        x.v.agg,
      );
    });
    return row;
  });
  const timeLike =
    cat.kind === "date" ||
    /period|month|year|date|quarter|week/i.test(cat.name) ||
    table.shape !== "list";
  const sort =
    visual.sort === "label" ||
    (timeLike && visual.sort !== "value-asc" && ["line", "area"].includes(visual.type))
      ? "label"
      : visual.sort;
  if (sort === "label") {
    if (cat.kind === "date") out.sort((a, b) => Date.parse(a.label) - Date.parse(b.label));
    else if (timeLike) {
      const order = periodOrder(table, cat.col);
      out.sort((a, b) => (order.get(a.label) ?? 0) - (order.get(b.label) ?? 0));
    } else out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  } else if (keys[0]) {
    const k = keys[0];
    const dir = sort === "value-asc" ? 1 : -1;
    out.sort((a, b) => dir * (((a[k] as number) ?? 0) - ((b[k] as number) ?? 0)));
  }
  if (visual.topN && visual.topN > 0) out = out.slice(0, visual.topN);
  else out = out.slice(0, 500);
  return { rows: out, keys, total };
}

// ---------- Formatting ----------

export function formatValue(
  v: number | string | null | undefined,
  format: FieldFormat,
  compact = false,
) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (format === "percent")
    return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(v);
  const abs = Math.abs(v);
  const opts: Intl.NumberFormatOptions =
    compact && abs >= 10000
      ? { notation: "compact", maximumFractionDigits: 1 }
      : {
          maximumFractionDigits:
            format === "count" || Number.isInteger(v) ? 0 : compact ? 1 : abs < 10 ? 2 : 0,
        };
  if (format === "currency")
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...opts }).format(
      v,
    );
  return new Intl.NumberFormat("en-US", opts).format(v);
}

export function measureFormat(value: VisualValue, model: DataModel, visual?: Visual): FieldFormat {
  if (value.agg === "count" || value.agg === "distinct") return "count";
  if (visual?.format) return visual.format;
  return model.fields.get(value.field)?.format ?? "number";
}

export function measureLabel(value: VisualValue, model: DataModel) {
  const f = model.fields.get(value.field);
  const name = f?.name ?? "Missing field";
  if (value.agg === "sum") return name;
  return `${AGG_LABELS[value.agg]} of ${name}`;
}

export function defaultAgg(field: Field): Agg {
  if (field.kind !== "number") return "count";
  return field.format === "percent" ? "avg" : "sum";
}

// ---------- Auto report ----------

let counter = 0;
export function newId(prefix = "v") {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

export function makeVisual(partial: Partial<Visual> & Pick<Visual, "table" | "type">): Visual {
  return {
    id: newId(),
    title: "",
    category: null,
    values: [],
    sort: "value-desc",
    topN: null,
    size: partial.type === "card" ? "s" : partial.type === "table" ? "l" : "m",
    ...partial,
  };
}

/** Quick-insights style page: KPI cards, a breakdown, a trend, a share chart and a detail table. */
export function autoPage(table: ModelTable, name?: string): ReportPage {
  if (table.shape === "summary") return summaryPage(table, name);
  if (table.shape === "matrix") return matrixPage(table, name);
  const measures = table.fields.filter((f) => f.kind === "number");
  const cats = table.fields.filter((f) => f.kind !== "number" && f.distinct >= 2);
  const time =
    cats.find((f) => f.kind === "date") ??
    cats.find((f) => /period|month|year|date|quarter|week/i.test(f.name));
  const breakdown = cats.filter((f) => f !== time).sort((a, b) => a.distinct - b.distinct);
  const main = breakdown.find((f) => f.distinct <= 60) ?? breakdown[0];
  const small =
    breakdown.find((f) => f !== main && f.distinct <= 8) ??
    (main && main.distinct <= 8 ? main : undefined);
  const visuals: Visual[] = [];
  const m0 = measures[0];
  for (const m of measures.slice(0, 4))
    visuals.push(
      makeVisual({
        table: table.name,
        type: "card",
        values: [{ field: m.id, agg: defaultAgg(m) }],
      }),
    );
  if (measures.length === 0)
    visuals.push(
      makeVisual({
        table: table.name,
        type: "card",
        title: "Row count",
        values: [{ field: table.fields[0]!.id, agg: "count" }],
      }),
    );
  const v0: VisualValue = m0
    ? { field: m0.id, agg: defaultAgg(m0) }
    : { field: table.fields[0]!.id, agg: "count" };
  if (time)
    visuals.push(
      makeVisual({
        table: table.name,
        type: m0 ? "area" : "line",
        category: time.id,
        values: [v0],
        sort: "label",
      }),
    );
  if (main)
    visuals.push(
      makeVisual({
        table: table.name,
        type: main.distinct > 12 ? "bar" : "column",
        category: main.id,
        values: [v0],
        topN: main.distinct > 15 ? 15 : null,
      }),
    );
  if (small)
    visuals.push(
      makeVisual({ table: table.name, type: "donut", category: small.id, values: [v0] }),
    );
  if (measures.length >= 2 && main && main.distinct >= 4)
    visuals.push(
      makeVisual({
        table: table.name,
        type: "scatter",
        category: main.id,
        values: [
          { field: measures[0]!.id, agg: defaultAgg(measures[0]!) },
          { field: measures[1]!.id, agg: defaultAgg(measures[1]!) },
        ],
      }),
    );
  const detailCat = main ?? time;
  if (detailCat)
    visuals.push(
      makeVisual({
        table: table.name,
        type: "table",
        category: detailCat.id,
        values: measures.slice(0, 5).map((m) => ({ field: m.id, agg: defaultAgg(m) })),
        sort: detailCat === time ? "label" : "value-desc",
      }),
    );
  const slicers = cats
    .filter((f) => f.distinct >= 2 && f.distinct <= 40)
    .slice(0, 3)
    .map((f) => f.id);
  return { id: newId("p"), name: name ?? table.name, visuals, slicers };
}

export function distinctValues(field: Field, model: DataModel): string[] {
  const table = model.tables.find((t) => t.name === field.table);
  if (!table) return [];
  const set = new Set<string>();
  for (const r of table.rows) set.add(cellText(r[field.col] ?? null));
  const list = [...set];
  if (field.kind === "date") return list.sort((a, b) => Date.parse(a) - Date.parse(b));
  if (table.unpivoted || /period|month|year|quarter/i.test(field.name)) return list;
  return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Drops visuals/slicers whose fields no longer exist after the workbook changed. */
export function sanitizePages(pages: ReportPage[], model: DataModel): ReportPage[] {
  return pages.map((p) => ({
    ...p,
    slicers: p.slicers.filter((s) => model.fields.has(s)),
    visuals: p.visuals.filter(
      (v) =>
        model.tables.some((t) => t.name === v.table) &&
        v.values.every((x) => model.fields.has(x.field)) &&
        (!v.category || model.fields.has(v.category)) &&
        (v.pins ?? []).every((p) => model.fields.has(p.field)),
    ),
  }));
}

export function visualTitle(visual: Visual, model: DataModel) {
  if (visual.title) return visual.title;
  const measures = visual.values.map((v) => measureLabel(v, model));
  const cat = visual.category ? model.fields.get(visual.category)?.name : null;
  if (visual.type === "scatter" && measures.length >= 2)
    return `${measures[0]} vs ${measures[1]}${cat ? ` by ${cat}` : ""}`;
  const m = measures.slice(0, 2).join(" and ") || "Values";
  return cat && visual.type !== "card" ? `${m} by ${cat}` : m;
}

export function labelFormat(label: string, values: number[]): FieldFormat {
  return inferFormat(label, values);
}

/** KPI list → one card per metric, each in its own unit; a table without a meaningless total. */
function summaryPage(table: ModelTable, name?: string): ReportPage {
  const label = table.fields.find((f) => f.kind === "category")!;
  const nums = table.fields.filter((f) => f.kind === "number");
  const first = nums[0]!;
  const visuals: Visual[] = table.rows.slice(0, 8).map((r) => {
    const l = String(r[label.col] ?? "");
    const v = r[first.col];
    return makeVisual({
      table: table.name,
      type: "card",
      title: l,
      values: [{ field: first.id, agg: "sum" }],
      pins: [{ field: label.id, values: [l] }],
      format: inferFormat(l, typeof v === "number" ? [v] : []),
    });
  });
  visuals.push(
    makeVisual({
      table: table.name,
      type: "table",
      category: label.id,
      values: nums.slice(0, 5).map((f) => ({ field: f.id, agg: "sum" as Agg })),
      sort: "label",
      title: `${table.name} — all metrics`,
    }),
  );
  return { id: newId("p"), name: name ?? table.name, visuals, slicers: [] };
}

const KEY_LINE =
  /^(?:total )?(?:revenue|net revenue|sales|net sales|gross profit|ebitda|operating income|ebit|net income|free cash flow|fcf|ending cash|net cash|total assets|total equity|arr|ending arr|mrr|ending mrr|noi|net operating income|cfads|dscr|irr|enterprise value|equity value|tce|nii|net interest income)\b/i;

/** Statement (line items × periods) → latest-period KPI cards, trends of key lines, statement table. */
function matrixPage(table: ModelTable, name?: string): ReportPage {
  const line = table.fields[0]!;
  const period = table.fields[1]!;
  const value = table.fields[table.fields.length - 1]!;
  const lines: string[] = [];
  const periods: string[] = [];
  for (const r of table.rows) {
    const l = String(r[line.col]);
    const p = String(r[period.col]);
    if (!lines.includes(l)) lines.push(l);
    if (!periods.includes(p)) periods.push(p);
  }
  const keys = [...lines.filter((l) => KEY_LINE.test(l)), ...lines.filter((l) => !KEY_LINE.test(l))]
    .filter((l, i, a) => a.indexOf(l) === i)
    .slice(0, 4);
  const last = periods[periods.length - 1]!;
  const fmt = (l: string) =>
    inferFormat(
      l,
      table.rows.filter((r) => r[line.col] === l).map((r) => r[value.col] as number),
    );
  const visuals: Visual[] = keys.map((l) =>
    makeVisual({
      table: table.name,
      type: "card",
      title: l,
      values: [{ field: value.id, agg: "sum" }],
      pins: [
        { field: line.id, values: [l] },
        { field: period.id, values: [last] },
      ],
      format: fmt(l),
    }),
  );
  keys.slice(0, 2).forEach((l, i) =>
    visuals.push(
      makeVisual({
        table: table.name,
        type: i === 0 ? "area" : "column",
        title: `${l} by ${period.name}`,
        category: period.id,
        values: [{ field: value.id, agg: "sum" }],
        pins: [{ field: line.id, values: [l] }],
        format: fmt(l),
        sort: "label",
      }),
    ),
  );
  visuals.push(
    makeVisual({
      table: table.name,
      type: "table",
      title: table.name,
      category: line.id,
      values: [{ field: value.id, agg: "sum" }],
      pins: [{ field: period.id, values: [last] }],
      sort: "label",
    }),
  );
  return { id: newId("p"), name: name ?? table.name, visuals, slicers: [period.id] };
}
