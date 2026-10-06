import {
  defaultAgg,
  makeVisual,
  type Agg,
  type DataModel,
  type Field,
  type ModelTable,
  type Visual,
  type VisualType,
} from "./report-model.ts";

/**
 * Local natural-language Q&A ("revenue by region as a pie", "top 5 products by profit",
 * "average margin over time"). Matches field names from the model; returns null when the
 * question names no known field so the caller can hand it to the AI instead.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

function mentions(q: string, field: Field) {
  const n = norm(field.name);
  if (!n) return -1;
  const idx = ` ${q} `.indexOf(` ${n} `);
  if (idx >= 0) return idx;
  // singular/plural tolerance
  const alt = n.endsWith("s") ? n.slice(0, -1) : `${n}s`;
  return ` ${q} `.indexOf(` ${alt} `);
}

export function parseQuestion(question: string, model: DataModel, preferTable?: string): Visual | null {
  const q = norm(question);
  if (!q) return null;
  let best: { table: ModelTable; hits: { f: Field; at: number }[] } | null = null;
  const ordered = [...model.tables].sort((a, b) =>
    a.name === preferTable ? -1 : b.name === preferTable ? 1 : 0,
  );
  for (const table of ordered) {
    const hits = table.fields
      .map((f) => ({ f, at: mentions(q, f) }))
      .filter((h) => h.at >= 0)
      .sort((a, b) => b.f.name.length - a.f.name.length);
    // also allow the table name itself to select the table
    const tableHit = ` ${q} `.includes(` ${norm(table.name)} `) ? 0.5 : 0;
    if (hits.length + tableHit > (best ? best.hits.length : 0)) best = { table, hits };
  }
  if (!best || best.hits.length === 0) return null;
  const { table } = best;
  // de-duplicate overlapping matches (keep longest names)
  const hits = best.hits.filter(
    (h, i, all) => !all.some((o, j) => j < i && norm(o.f.name).includes(norm(h.f.name))),
  );
  const measures = hits.filter((h) => h.f.kind === "number").sort((a, b) => a.at - b.at);
  const cats = hits.filter((h) => h.f.kind !== "number").sort((a, b) => a.at - b.at);

  let agg: Agg | null = null;
  if (/\b(average|avg|mean)\b/.test(q)) agg = "avg";
  else if (/\b(how many|count|number of)\b/.test(q)) agg = measures.length ? "count" : "count";
  else if (/\b(distinct|unique)\b/.test(q)) agg = "distinct";
  else if (/\b(minimum|min|lowest|smallest)\b/.test(q) && !/\b(top|bottom)\b/.test(q)) agg = "min";
  else if (/\b(maximum|max|highest|largest|biggest)\b/.test(q) && !/\b(top|bottom)\b/.test(q)) agg = "max";
  else if (/\b(total|sum)\b/.test(q)) agg = "sum";

  const time = /\b(over time|trend|by month|monthly|by year|yearly|by period|by quarter|timeline)\b/.test(q);
  let type: VisualType | null = null;
  if (/\bdonut|doughnut\b/.test(q)) type = "donut";
  else if (/\bpie\b|\bshare\b|\bsplit\b|\bmix\b|\bbreakdown of\b/.test(q)) type = "pie";
  else if (/\barea\b/.test(q)) type = "area";
  else if (/\bline\b/.test(q) || time) type = "line";
  else if (/\btable\b|\blist\b|\bmatrix\b|\bdetail/.test(q)) type = "table";
  else if (/\bscatter\b|\bvs\b|\bversus\b|\bcorrelat/.test(q)) type = "scatter";
  else if (/\bbar\b|\bhorizontal\b/.test(q)) type = "bar";
  else if (/\bcolumn\b/.test(q)) type = "column";
  else if (/\bcard\b|\bkpi\b/.test(q)) type = "card";

  const topMatch = q.match(/\b(top|bottom)\s+(\d{1,3})\b/);
  const topN = topMatch ? Number(topMatch[2]) : null;
  const sort = topMatch?.[1] === "bottom" ? "value-asc" : "value-desc";

  let category: Field | undefined = cats[0]?.f;
  if (!category && time)
    category = table.fields.find(
      (f) => f.kind === "date" || /period|month|year|date|quarter|week/i.test(f.name),
    );
  const valueFields = measures.length
    ? measures.slice(0, type === "scatter" ? 2 : type === "table" ? 6 : 3).map((h) => h.f)
    : [];
  if (type === "scatter" && valueFields.length < 2) {
    const extra = table.fields.find((f) => f.kind === "number" && !valueFields.includes(f));
    if (extra) valueFields.push(extra);
  }
  const values = valueFields.length
    ? valueFields.map((f) => ({ field: f.id, agg: agg && agg !== "count" ? agg : agg === "count" ? "count" : defaultAgg(f) }))
    : [{ field: (category ?? table.fields[0]!).id, agg: (agg === "distinct" ? "distinct" : "count") as Agg }];

  const finalType: VisualType =
    type ??
    (!category
      ? "card"
      : category.kind === "date" || /period|month|year|quarter|week/i.test(category.name)
        ? "line"
        : category.distinct > 12
          ? "bar"
          : "column");
  return makeVisual({
    table: table.name,
    type: category ? finalType : "card",
    category: category && finalType !== "card" ? category.id : null,
    values,
    topN,
    sort: ["line", "area"].includes(finalType) && !topN ? "label" : sort,
  });
}
