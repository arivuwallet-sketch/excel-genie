import type { Sheet } from "./spreadsheet";
import { numericValue, columnLabel } from "./workbook-intelligence.ts";
import { validateWorkbook } from "./workbook-limits.ts";
import { CalcError, parseFormula, type Scalar } from "./calculator/parser.ts";
import { evaluate } from "./calculator/evaluate.ts";
export { SUPPORTED_FUNCTIONS } from "./calculator/evaluate.ts";

export type CalculationIssue = { sheet: string; cell: string; error: string };
export type Calculation = { sheets: Sheet[]; issues: CalculationIssue[]; formulaCount: number };

/** Bounded calculation of an explicit Excel subset. Original formulas are never replaced. */
export function calculateWorkbook(sheets: Sheet[], workLimit = 1_000_000): Calculation {
  validateWorkbook(sheets);
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
  const cache = new Map<string, Scalar | CalcError>(),
    visiting = new Set<string>();
  const issues: CalculationIssue[] = [];
  let work = 0,
    depth = 0,
    formulaCount = 0;
  const read = (name: string, row: number, col: number): Scalar => {
    if (++work > workLimit || depth >= 100) throw new CalcError("#LIMIT!");
    const sheet = byName.get(name.toLowerCase());
    if (!sheet) throw new CalcError("#REF!");
    const key = `${sheet.name}:${row}:${col}`;
    if (cache.has(key)) {
      const value = cache.get(key)!;
      if (value instanceof CalcError) throw value;
      return value;
    }
    if (visiting.has(key)) throw new CalcError("#CYCLE!");
    const raw = sheet.rows[row - 1]?.[col - 1] ?? "";
    if (!raw.trimStart().startsWith("=")) {
      if (/^#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CALC!)$/.test(raw))
        throw new CalcError(raw);
      if (raw.startsWith("'")) return raw.slice(1);
      if (/^(TRUE|FALSE)$/i.test(raw)) return raw.toUpperCase() === "TRUE";
      return raw === "" ? null : (numericValue(raw) ?? raw);
    }
    visiting.add(key);
    depth++;
    try {
      const tree = parseFormula(raw.trimStart().slice(1));
      const value = evaluate(tree, (ref) => {
        const source = ref.sheet ?? sheet.name;
        if (ref.row === ref.endRow && ref.col === ref.endCol) return read(source, ref.row, ref.col);
        const height = ref.endRow - ref.row + 1,
          width = ref.endCol - ref.col + 1;
        if (height * width > workLimit - work) throw new CalcError("#LIMIT!");
        return Array.from({ length: height }, (_, r) =>
          Array.from({ length: width }, (_, c) => read(source, ref.row + r, ref.col + c)),
        );
      });
      if (Array.isArray(value)) throw new CalcError("#UNSUPPORTED!");
      if (typeof value === "string" && value.length > 10000) throw new CalcError("#LIMIT!");
      cache.set(key, value);
      return value;
    } catch (e) {
      const error = e instanceof CalcError ? e : new CalcError("#ERROR!");
      cache.set(key, error);
      throw error;
    } finally {
      depth--;
      visiting.delete(key);
    }
  };
  const values = sheets.map((sheet) => ({
    ...sheet,
    rows: sheet.rows.map((row, r) =>
      row.map((raw, c) => {
        if (!raw.trimStart().startsWith("=")) return raw;
        formulaCount++;
        try {
          const value = read(sheet.name, r + 1, c + 1);
          // Formula-looking text stays text when exporting or making a values copy.
          return value === null
            ? "0"
            : typeof value === "boolean"
              ? String(value).toUpperCase()
              : typeof value === "number"
                ? String(Number(value.toPrecision(15)))
                : value.startsWith("=")
                  ? `'${value}`
                  : value;
        } catch (e) {
          const error = e instanceof CalcError ? e.code : "#ERROR!";
          issues.push({ sheet: sheet.name, cell: `${columnLabel(c)}${r + 1}`, error });
          return error;
        }
      }),
    ),
  }));
  return { sheets: values, issues, formulaCount };
}
