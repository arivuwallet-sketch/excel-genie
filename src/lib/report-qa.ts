import {
  defaultAgg,
  labelFormat,
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
  type ValueHit = { f: Field; value: string };
  let best: { table: ModelTable; hits: { f: Field; at: number }[]; values: ValueHit[] } | null =
    null;
  let bestScore = 0;
  const ordered = [...model.tables].sort((a, b) =>
    a.name === preferTable ? -1 : b.name === preferTable ? 1 : 0,
  );
  for (const table of ordered) {
    const hits = table.fields
      .map((f) => ({ f, at: mentions(q, f) }))
      .filter((h) => h.at >= 0)
      .sort((a, b) => b.f.name.length - a.f.name.length);
    // Values named in the question ("revenue" in a statement, "West" in a Region column).
    const values: ValueHit[] = [];
    for (const f of table.fields) {
      if (f.kind === "number" || f.distinct > 300) continue;
      const seen = new Set<string>();
      for (const r of table.rows) {
        const raw = r[f.col];
        if (typeof raw !== "string" || seen.has(raw)) continue;
        seen.add(raw);
        const n = norm(raw);
        if (n.length >= 3 && ` ${q} `.includes(` ${n} `) && !hits.some((h) => norm(h.f.name) === n))
          values.push({ f, value: raw });
      }
    }
    const tableHit = ` ${q} `.includes(` ${norm(table.name)} `) ? 0.5 : 0;
    const score = hits.length + values.length * 0.9 + tableHit;
    if (score > bestScore) {
      bestScore = score;
      best = { table, hits, values };
    }
  }
  if (!best || (best.hits.length === 0 && best.values.length === 0)) return null;
  const { table } = best;
  // de-duplicate overlapping matches (keep longest names)
  const hits = best.hits.filter(
    (h, i, all) => !all.some((o, j) => j < i && norm(o.f.name).includes(norm(h.f.name))),
  );
  const valueHits = best.values.filter(
    (v, i, all) => !all.some((o, j) => j !== i && o.f === v.f && norm(o.value).includes(norm(v.value)) && o.value.length > v.value.length),
  );
  const pinMap = new Map<string, string[]>();
  for (const v of valueHits) pinMap.set(v.f.id, [...(pinMap.get(v.f.id) ?? []), v.value]);
  const pins = [...pinMap.entries()].map(([field, values]) => ({ field, values }));
  const measures = hits.filter((h) => h.f.kind === "number").sort((a, b) => a.at - b.at);
  if (measures.length === 0 && table.shape === "matrix") {
    const valueField = table.fields[table.fields.length - 1]!;
    measures.push({ f: valueField, at: 0 });
  }
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

  let category: Field | undefined = cats.find((c) => !pinMap.has(c.f.id))?.f ?? cats[0]?.f;
  if (!category && table.shape === "matrix" && !/\b(total|card|kpi)\b/.test(q))
    category = table.fields[1]; // Period
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
  const pinnedLine = table.shape !== "list" ? valueHits[0]?.value : undefined;
  return makeVisual({
    table: table.name,
    pins,
    format: pinnedLine && valueHits.length === 1 ? labelFormat(pinnedLine, []) : null,
    title: pinnedLine ? `${valueHits.map((v) => v.value).join(", ")}${category ? ` by ${category.name}` : ""}` : "",
    type: category ? finalType : "card",
    category: category && finalType !== "card" ? category.id : null,
    values,
    topN,
    sort: ["line", "area"].includes(finalType) && !topN ? "label" : sort,
  });
}
