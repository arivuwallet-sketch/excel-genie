import { isNumeric } from "./excel-export";
import type { Sheet } from "./spreadsheet";

/**
 * Classify a sheet's columns as chartable "text" (category/label) or "numeric" (value) columns.
 * A column dominated by formulas (>=40% of its non-empty cells) is deliberately excluded from
 * both buckets: there's no client-side formula engine here, so a formula cell is neither a usable
 * number nor a usable label — treating it as either produces formula text or 0s in a chart.
 */
export function detectColumns(sheet: Sheet) {
  const header = sheet.rows[1] ?? [];
  const dataRows = sheet.rows.slice(2);
  const width = header.length || Math.max(1, ...sheet.rows.map((r) => r.length));

  const numericCols: number[] = [];
  const textCols: number[] = [];
  for (let c = 0; c < width; c++) {
    const values = dataRows.map((r) => r[c] ?? "").filter((v) => v !== "");
    if (values.length === 0) continue;
    const formulaShare = values.filter((v) => v.trim().startsWith("=")).length / values.length;
    const numericCount = values.filter((v) => isNumeric(v) && !v.trim().startsWith("=")).length;
    if (numericCount / values.length >= 0.6) numericCols.push(c);
    else if (formulaShare < 0.4) textCols.push(c);
  }
  return { header, dataRows, numericCols, textCols };
}
