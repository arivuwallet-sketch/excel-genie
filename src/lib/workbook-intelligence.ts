import type { Sheet } from "./spreadsheet";

export function columnLabel(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}
/** Locale-neutral parsing; identifiers with leading zeroes remain text. */
export function numericValue(raw: string): number | null {
  const text = raw.trim();
  if (!text || text.startsWith("=")) return null;
  const negative = /^\(.*\)$/.test(text);
  const value = text.replace(/^\(|\)$/g, "").replace(/^[$£€₹]\s*/, "");
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?%?$/.test(value) || /^[+-]?0\d/.test(value))
    return null;
  if (value.replace(/[^0-9]/g, "").replace(/^0+/, "").length > 15 && !/[.%]/.test(value))
    return null;
  const n =
    (Number(value.replace(/,/g, "").replace(/%$/, "")) * (negative ? -1 : 1)) /
    (value.endsWith("%") ? 100 : 1);
  return Number.isFinite(n) ? n : null;
}
export type ColumnProfile = {
  index: number;
  name: string;
  filled: number;
  missing: number;
  unique: number;
  formulas: number;
  numeric: number;
  sum: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  outliers: number;
};
export function profileSheet(sheet: Sheet) {
  const width = sheet.rows.reduce((n, r) => Math.max(n, r.length), 0);
  const body = sheet.rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of body) {
    const key = JSON.stringify(Array.from({ length: width }, (_, i) => row[i] ?? ""));
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  const columns: ColumnProfile[] = Array.from({ length: width }, (_, index) => {
    const values = body.map((r) => r[index] ?? "");
    const filled = values.filter((v) => v.trim() !== "");
    const numbers = values
      .map(numericValue)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const sum = numbers.length ? numbers.reduce((a, b) => a + b, 0) : null;
    const quartile = (q: number) => {
      const pos = (numbers.length - 1) * q;
      const a = numbers[Math.floor(pos)] ?? 0;
      return a + ((numbers[Math.ceil(pos)] ?? a) - a) * (pos % 1);
    };
    const q1 = quartile(0.25),
      q3 = quartile(0.75),
      iqr = q3 - q1;
    return {
      index,
      name: sheet.rows[0]?.[index] || columnLabel(index),
      filled: filled.length,
      missing: values.length - filled.length,
      unique: new Set(filled).size,
      formulas: values.filter((v) => v.startsWith("=")).length,
      numeric: numbers.length,
      sum,
      mean: sum === null ? null : sum / numbers.length,
      min: numbers[0] ?? null,
      max: numbers.at(-1) ?? null,
      outliers:
        numbers.length >= 4
          ? numbers.filter((n) => n < q1 - 1.5 * iqr || n > q3 + 1.5 * iqr).length
          : 0,
    };
  });
  return {
    rows: body.length,
    columns,
    duplicates,
    blankRows: sheet.rows.slice(1).length - body.length,
    missing: columns.reduce((n, c) => n + c.missing, 0),
    formulas: columns.reduce((n, c) => n + c.formulas, 0),
  };
}
export type CleanAction = "trim" | "deduplicate" | "remove_blank_rows";
export function cleanSheet(sheet: Sheet, action: CleanAction): Sheet {
  if (action === "trim")
    return {
      ...sheet,
      rows: sheet.rows.map((row) => row.map((v) => (v.startsWith("=") ? v : v.trim()))),
    };
  const width = sheet.rows.reduce((n, r) => Math.max(n, r.length), 0);
  const seen = new Set<string>();
  const rows = sheet.rows.filter((row, i) => {
    if (i === 0) return true;
    if (action === "remove_blank_rows") return row.some((v) => v.trim() !== "");
    const key = JSON.stringify(Array.from({ length: width }, (_, c) => row[c] ?? ""));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...sheet, rows: rows.map((r) => [...r]) };
}
export function pivotSheet(
  sheet: Sheet,
  group: number,
  value: number,
  aggregation: "sum" | "average" | "count",
): Sheet {
  const groups = new Map<string, { total: number; count: number; numeric: number }>();
  for (const row of sheet.rows.slice(1)) {
    if (!row.some((v) => v.trim())) continue;
    const key = row[group] ?? "";
    const bucket = groups.get(key) ?? { total: 0, count: 0, numeric: 0 };
    const n = numericValue(row[value] ?? "");
    bucket.count++;
    if (n !== null) {
      bucket.total += n;
      bucket.numeric++;
    }
    groups.set(key, bucket);
  }
  return {
    name: `${sheet.name.slice(0, 22)} Summary`,
    rows: [
      [sheet.rows[0]?.[group] || "Group", `${aggregation} of ${sheet.rows[0]?.[value] || "Value"}`],
      ...Array.from(groups, ([key, b]) => [
        key,
        aggregation === "count"
          ? String(b.count)
          : b.numeric === 0
            ? ""
            : String(aggregation === "average" ? b.total / b.numeric : b.total),
      ]),
    ],
  };
}
export type CellChange = { sheet: string; cell: string; before: string; after: string };
export function workbookDiff(before: Sheet[], after: Sheet[], limit = 100) {
  const changes: CellChange[] = [];
  let total = 0;
  const names = [...new Set([...before, ...after].map((s) => s.name))];
  const added = after.filter((s) => !before.some((b) => b.name === s.name)).map((s) => s.name);
  const removed = before.filter((s) => !after.some((b) => b.name === s.name)).map((s) => s.name);
  for (const name of names) {
    const a = before.find((s) => s.name === name)?.rows ?? [],
      b = after.find((s) => s.name === name)?.rows ?? [];
    for (let r = 0; r < Math.max(a.length, b.length); r++)
      for (let c = 0; c < Math.max(a[r]?.length ?? 0, b[r]?.length ?? 0); c++) {
        const oldValue = a[r]?.[c] ?? "",
          newValue = b[r]?.[c] ?? "";
        if (oldValue === newValue) continue;
        total++;
        if (changes.length < limit)
          changes.push({
            sheet: name,
            cell: `${columnLabel(c)}${r + 1}`,
            before: oldValue,
            after: newValue,
          });
      }
  }
  return { total, changes, added, removed };
}
/** Bounded, labelled context. Profiles are full-sheet; rows are explicitly sampled. */
export function workbookContext(sheets: Sheet[], activeSheet?: string, maxChars = 60000): string {
  const ordered = [...sheets].sort(
    (a, b) => Number(b.name === activeSheet) - Number(a.name === activeSheet),
  );
  let budget = Math.max(0, maxChars - ordered.length);
  return ordered
    .map((sheet, index) => {
      const p = profileSheet(sheet);
      const allowance = Math.max(0, Math.floor(budget / (ordered.length - index)));
      const columns = p.columns
        .slice(0, Math.max(1, Math.floor(allowance / 700)))
        .map((c) => ({ ...c, name: c.name.slice(0, 120) }));
      const header = JSON.stringify({
        sheet: sheet.name,
        active: sheet.name === activeSheet,
        totalRows: sheet.rows.length,
        ...p,
        columns,
        omittedColumnProfiles: p.columns.length - columns.length,
      });
      const indices = [
        ...new Set([
          0,
          ...Array.from({ length: Math.min(20, sheet.rows.length) }, (_, i) => i),
          ...Array.from({ length: 40 }, (_, i) => Math.floor(((sheet.rows.length - 1) * i) / 39)),
          ...Array.from(
            { length: Math.min(10, sheet.rows.length) },
            (_, i) => sheet.rows.length - 1 - i,
          ),
        ]),
      ]
        .filter((i) => i >= 0 && i < sheet.rows.length)
        .sort((a, b) => a - b);
      let part = header;
      let included = 0;
      for (const i of indices) {
        const line = "\n" + JSON.stringify({ row: i + 1, values: sheet.rows[i] });
        if (part.length + line.length > allowance - 170) continue;
        part += line;
        included++;
      }
      part += `\nCONTEXT COVERAGE: ${included}/${sheet.rows.length} rows shown. Omitted rows exist. Never infer missing values or claim exhaustive analysis from samples.\n`;
      budget -= part.length;
      return part;
    })
    .join("\n");
}
