import type { Sheet } from "./spreadsheet";
import { numericValue } from "./workbook-intelligence.ts";
import { validateWorkbook } from "./workbook-limits.ts";

export type PbiColumn = { name: string; dataType: "String" | "Double" };
export type PbiTable = {
  name: string;
  sanitized: string;
  columns: PbiColumn[];
  rows: Record<string, string | number | null>[];
};

function uniqueName(raw: string, used: Set<string>, fallback: string): string {
  const base =
    raw
      // eslint-disable-next-line no-control-regex -- remove invalid control characters from names
      .replace(/[\u0000-\u001f]/g, " ")
      .trim()
      .slice(0, 100) || fallback;
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` ${n}`;
    name = base.slice(0, 100 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

/** Row one is the header, matching the grid's profiling and summary tools. */
export function toPbiTables(sheets: Sheet[]): PbiTable[] {
  validateWorkbook(sheets);
  const tableNames = new Set<string>();
  return sheets
    .filter((sheet) => sheet.rows.some((row) => row.some((value) => value.trim())))
    .map((sheet) => {
      if (sheet.rows.some((row) => row.some((value) => value.trimStart().startsWith("=")))) {
        throw new Error(
          `"${sheet.name}" contains unevaluated formulas. Calculate in Excel and import a values-only copy before pushing to Power BI.`,
        );
      }
      const header = sheet.rows[0] ?? [];
      const body = sheet.rows.slice(1).filter((row) => row.some((value) => value.trim()));
      const width = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
      const columnNames = new Set<string>();
      const columns: PbiColumn[] = Array.from({ length: width }, (_, c) => {
        const values = body.map((row) => row[c] ?? "").filter((value) => value.trim());
        return {
          name: uniqueName(header[c] ?? "", columnNames, `Column ${c + 1}`),
          dataType:
            values.length > 0 && values.every((value) => numericValue(value) !== null)
              ? "Double"
              : "String",
        };
      });
      return {
        name: sheet.name,
        sanitized: uniqueName(sheet.name.replace(/[^A-Za-z0-9 _-]/g, " "), tableNames, "Sheet"),
        columns,
        rows: body.map((row) =>
          Object.fromEntries(
            columns.map((column, c) => {
              const raw = row[c] ?? "";
              return [column.name, column.dataType === "Double" ? numericValue(raw) : raw];
            }),
          ),
        ),
      };
    });
}

/** Check every destination before deleting any rows. Schema changes require a new dataset. */
export function assertPbiSchema(
  tables: PbiTable[],
  existing: { name: string; columns: { name: string; dataType: string }[] }[],
): void {
  if (
    tables.length !== existing.length ||
    tables.some((table) => {
      const target = existing.find((item) => item.name === table.sanitized);
      return (
        !target ||
        target.columns.length !== table.columns.length ||
        table.columns.some(
          (column) =>
            !target.columns.some(
              (item) =>
                item.name === column.name &&
                item.dataType.toLowerCase() === column.dataType.toLowerCase(),
            ),
        )
      );
    })
  )
    throw new Error(
      "Power BI dataset schema differs from this workbook. Use a new POWERBI_DATASET_NAME; no existing rows were cleared.",
    );
}
