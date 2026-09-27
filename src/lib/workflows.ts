import type { Sheet } from "./spreadsheet";
import { numericValue } from "./workbook-intelligence.ts";
import { MAX_ROWS, validateWorkbook } from "./workbook-limits.ts";

const populated = (row: string[]) => row.some((v) => v.trim());
const body = (sheet: Sheet) =>
  sheet.rows
    .slice(1)
    .map((values, index) => ({ values, row: index + 2 }))
    .filter((r) => populated(r.values));
function table(sheet: Sheet) {
  if (!sheet.rows.length || !populated(sheet.rows[0]!))
    throw new Error(`"${sheet.name}" needs column headings in row 1.`);
  if (sheet.rows.some((row) => row.slice(sheet.rows[0]!.length).some((v) => v.trim())))
    throw new Error(
      `"${sheet.name}" has data beyond its column headings. Add a heading for each populated column first.`,
    );
  if (sheet.rows.some((row) => row.some((v) => v.trimStart().startsWith("="))))
    throw new Error(
      `"${sheet.name}" contains formulas. Use Calculate → Values copy first, or import calculated values.`,
    );
}
function column(sheet: Sheet, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= (sheet.rows[0]?.length ?? 0))
    throw new Error("Select a valid column.");
}
function result(name: string, rows: string[][]): Sheet {
  const sheet = { name, rows };
  validateWorkbook([sheet]);
  return sheet;
}
const keyOf = (text: string, caseSensitive = false) =>
  caseSensitive ? text.trim() : text.trim().toLocaleLowerCase("en-US");

export function reconcileSheets(
  left: Sheet,
  right: Sheet,
  options: {
    leftKey: number;
    rightKey: number;
    leftAmount: number;
    rightAmount: number;
    tolerance: number;
    caseSensitive?: boolean;
  },
): Sheet {
  table(left);
  table(right);
  for (const c of [options.leftKey, options.leftAmount]) column(left, c);
  for (const c of [options.rightKey, options.rightAmount]) column(right, c);
  if (!Number.isFinite(options.tolerance) || options.tolerance < 0)
    throw new Error("Tolerance must be a nonnegative number.");
  const l = body(left),
    r = body(right);
  const group = (items: typeof l, col: number) => {
    const map = new Map<string, typeof l>();
    for (const item of items) {
      const key = keyOf(item.values[col] ?? "", options.caseSensitive);
      if (key) {
        const group = map.get(key);
        if (group) group.push(item);
        else map.set(key, [item]);
      }
    }
    return map;
  };
  const leftKeys = group(l, options.leftKey),
    rightKeys = group(r, options.rightKey);
  const output: string[][] = [
    [
      "Status",
      "Key",
      "Left row",
      "Right row",
      "Left amount",
      "Right amount",
      "Difference",
      "Explanation",
    ],
  ];
  const consumed = new Set<string>();
  for (const item of l) {
    const rawKey = item.values[options.leftKey] ?? "",
      key = keyOf(rawKey, options.caseSensitive);
    const candidates = rightKeys.get(key) ?? [],
      own = leftKeys.get(key) ?? [];
    if (!key) {
      output.push([
        "Missing key",
        rawKey,
        String(item.row),
        "",
        item.values[options.leftAmount] ?? "",
        "",
        "",
        "No match attempted",
      ]);
      continue;
    }
    if (own.length > 1 || candidates.length > 1) {
      if (candidates.length) consumed.add(key);
      output.push([
        "Ambiguous",
        rawKey,
        String(item.row),
        candidates
          .slice(0, 20)
          .map((row) => row.row)
          .join(", ") + (candidates.length > 20 ? ` (+${candidates.length - 20} more)` : ""),
        item.values[options.leftAmount] ?? "",
        candidates
          .slice(0, 20)
          .map((row) => (row.values[options.rightAmount] ?? "").slice(0, 100))
          .join("; "),
        "",
        "Duplicate key: resolve duplicates before matching",
      ]);
      continue;
    }
    const match = candidates[0];
    if (!match) {
      output.push([
        "Left only",
        rawKey,
        String(item.row),
        "",
        item.values[options.leftAmount] ?? "",
        "",
        "",
        "No matching key",
      ]);
      continue;
    }
    consumed.add(key);
    const a = numericValue(item.values[options.leftAmount] ?? ""),
      b = numericValue(match.values[options.rightAmount] ?? "");
    const diff = a === null || b === null ? null : Number((a - b).toPrecision(15));
    const matched =
      diff !== null &&
      Math.abs(diff) <=
        options.tolerance + Number.EPSILON * Math.max(1, Math.abs(a!), Math.abs(b!));
    output.push([
      diff === null ? "Invalid amount" : matched ? "Matched" : "Variance",
      rawKey,
      String(item.row),
      String(match.row),
      item.values[options.leftAmount] ?? "",
      match.values[options.rightAmount] ?? "",
      diff === null ? "" : String(diff),
      diff === null ? "Both amounts must be numeric" : `Tolerance: ${options.tolerance}`,
    ]);
  }
  for (const item of r) {
    const key = keyOf(item.values[options.rightKey] ?? "", options.caseSensitive);
    if (!consumed.has(key))
      output.push([
        !key ? "Missing key" : (rightKeys.get(key)?.length ?? 0) > 1 ? "Ambiguous" : "Right only",
        item.values[options.rightKey] ?? "",
        "",
        String(item.row),
        "",
        item.values[options.rightAmount] ?? "",
        "",
        !key
          ? "No match attempted"
          : (rightKeys.get(key)?.length ?? 0) > 1
            ? "Duplicate right key; no unique left match"
            : "No unique left match",
      ]);
  }
  return result("Reconciliation", output);
}

export function joinSheets(left: Sheet, right: Sheet, leftKey: number, rightKey: number): Sheet {
  table(left);
  table(right);
  column(left, leftKey);
  column(right, rightKey);
  const lookup = new Map<string, string[]>();
  for (const item of body(right)) {
    const key = keyOf(item.values[rightKey] ?? "");
    if (!key) continue;
    if (lookup.has(key))
      throw new Error(
        `Duplicate lookup key "${key}". Resolve it before joining; no rows were changed.`,
      );
    lookup.set(key, item.values);
  }
  const leftWidth = left.rows[0]!.length,
    rightWidth = right.rows[0]!.length;
  return result("Joined data", [
    [...left.rows[0]!, ...right.rows[0]!.map((v) => `${right.name}: ${v}`), "Match status"],
    ...body(left).map(({ values }) => {
      const matched = lookup.get(keyOf(values[leftKey] ?? ""));
      return [
        ...Array.from({ length: leftWidth }, (_, i) => values[i] ?? ""),
        ...Array.from({ length: rightWidth }, (_, i) => matched?.[i] ?? ""),
        matched ? "Matched" : "Unmatched",
      ];
    }),
  ]);
}

export function consolidateSheets(sheets: Sheet[]): Sheet {
  if (sheets.length < 2) throw new Error("Select at least two sheets to consolidate.");
  const names = new Map<string, string>();
  const mapped = sheets.map((sheet) => {
    table(sheet);
    const keys = sheet.rows[0]!.map((v, i) => keyOf(v) || `column ${i + 1}`);
    if (new Set(keys).size !== keys.length)
      throw new Error(`"${sheet.name}" has duplicate column headings.`);
    keys.forEach((key, i) => {
      if (!names.has(key)) names.set(key, sheet.rows[0]![i] || `Column ${i + 1}`);
    });
    return { sheet, keys };
  });
  const headers = [...names.keys()],
    rows: string[][] = [["Source sheet", "Source row", ...names.values()]];
  for (const { sheet, keys } of mapped)
    for (const item of body(sheet)) {
      rows.push([
        sheet.name,
        String(item.row),
        ...headers.map((key) => {
          const i = keys.indexOf(key);
          return i < 0 ? "" : (item.values[i] ?? "");
        }),
      ]);
      if (rows.length > MAX_ROWS)
        throw new Error("Consolidated result exceeds 10,000 rows. Split the source files.");
    }
  return result("Consolidated", rows);
}

export function findReplace(
  sheet: Sheet,
  find: string,
  replacement: string,
  caseSensitive = false,
): Sheet {
  if (!find) throw new Error("Enter the text to find.");
  const pattern = new RegExp(
    find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    caseSensitive ? "g" : "gi",
  );
  return {
    ...sheet,
    rows: sheet.rows.map((row) =>
      row.map((value) =>
        value.trimStart().startsWith("=") ? value : value.replace(pattern, () => replacement),
      ),
    ),
  };
}
export function splitColumn(sheet: Sheet, index: number, delimiter: string): Sheet {
  table(sheet);
  column(sheet, index);
  if (!delimiter) throw new Error("Enter a separator.");
  const parts = sheet.rows.slice(1).map((row) => (row[index] ?? "").split(delimiter));
  const width = parts.reduce((max, row) => Math.max(max, row.length), 1);
  return result(`${sheet.name.slice(0, 24)} Split`, [
    [
      ...sheet.rows[0]!,
      ...Array.from({ length: width }, (_, i) => `${sheet.rows[0]![index]} ${i + 1}`),
    ],
    ...sheet.rows
      .slice(1)
      .map((row, r) => [
        ...Array.from({ length: sheet.rows[0]!.length }, (_, c) => row[c] ?? ""),
        ...Array.from({ length: width }, (_, c) => parts[r]?.[c] ?? ""),
      ]),
  ]);
}
export function stressSheet(sheet: Sheet, index: number, changePercent: number): Sheet {
  table(sheet);
  column(sheet, index);
  if (!Number.isFinite(changePercent) || changePercent < -100 || changePercent > 1000)
    throw new Error("Use a stress change from -100% to 1000%.");
  return result("Stress scenario", [
    [...sheet.rows[0]!, `Stressed ${sheet.rows[0]![index]}`, "Change %"],
    ...body(sheet).map(({ values }) => {
      const n = numericValue(values[index] ?? "");
      return [
        ...Array.from({ length: sheet.rows[0]!.length }, (_, c) => values[c] ?? ""),
        n === null ? "" : String(Number((n * (1 + changePercent / 100)).toPrecision(15))),
        `${changePercent}%`,
      ];
    }),
  ]);
}
export function syntheticTransactions(count: number, seed = 42): Sheet {
  if (!Number.isInteger(count) || count < 1 || count >= MAX_ROWS)
    throw new Error("Use 1–9,999 data rows plus the header.");
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return result("Synthetic test data", [
    ["Test transaction", "Month", "Region", "Category", "Amount", "Source"],
    ...Array.from({ length: count }, (_, i) => [
      `TEST-${String(i + 1).padStart(6, "0")}`,
      `2026-${String(1 + Math.floor(random() * 12)).padStart(2, "0")}`,
      ["North", "South", "East", "West"][Math.floor(random() * 4)]!,
      ["Product", "Service", "Subscription"][Math.floor(random() * 3)]!,
      (50 + random() * 4950).toFixed(2),
      "Synthetic — not real transactions",
    ]),
  ]);
}
