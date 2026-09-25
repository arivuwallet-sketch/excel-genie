import type { Sheet } from "./spreadsheet";
import type { SheetOp } from "./sheet-ops";
import { collectRefs } from "./formula-audit.ts";
import {
  MAX_ROWS,
  MAX_COLS,
  MAX_CELLS,
  parseCellAddress,
  validateWorkbook,
} from "./workbook-limits.ts";
export type OpResult = {
  sheets: Sheet[];
  /** Operations that named a sheet or cell that doesn't resolve — the entire batch rolls back on any failure. */
  problems: string[];
};

const findSheet = (sheets: Sheet[], name: string) =>
  sheets.find((s) => s.name.toLowerCase() === name.toLowerCase());

const widthOf = (sheet: Sheet) => sheet.rows.reduce((m, r) => Math.max(m, r.length), 1);

function padRow(row: string[], width: number): string[] {
  return row.length >= width ? row : [...row, ...Array(width - row.length).fill("")];
}

function padSheet(sheet: Sheet, width: number) {
  sheet.rows = sheet.rows.map((r) => padRow(r, width));
}

/** Apply a sequence of operations to the current workbook, in order. */
export function applyOperations(current: Sheet[], ops: SheetOp[]): OpResult {
  try {
    validateWorkbook(current);
  } catch (e) {
    return { sheets: current, problems: [String(e)] };
  }
  if (ops.length > 200)
    return { sheets: current, problems: ["At most 200 operations per request."] };
  let sheets: Sheet[] = current.map((s) => ({ name: s.name, rows: s.rows.map((r) => [...r]) }));
  const problems: string[] = [];

  for (const op of ops) {
    try {
      if (
        (op.op === "insert_rows" || op.op === "delete_rows" || op.op === "rename_sheet") &&
        sheets.some((s) => s.rows.some((r) => r.some((v) => v.startsWith("="))))
      )
        throw new Error(
          "Structural edits on formula workbooks require reference translation. Use targeted edits or a separate output sheet.",
        );
      if (op.op === "insert_rows" || op.op === "delete_rows") {
        const target = findSheet(sheets, op.sheet);
        if (
          !Number.isInteger(op.atRow) ||
          op.atRow < 1 ||
          op.atRow > (target?.rows.length ?? 0) + (op.op === "insert_rows" ? 1 : 0)
        )
          throw new Error("Invalid row position.");
        if (
          op.op === "delete_rows" &&
          (!Number.isInteger(op.count) ||
            op.count < 1 ||
            op.atRow - 1 + op.count > (target?.rows.length ?? 0))
        )
          throw new Error("Invalid row count.");
        if (op.op === "insert_rows" && (target?.rows.length ?? 0) + op.rows.length > MAX_ROWS)
          throw new Error("Row limit exceeded.");
      }
      if (op.op === "create_sheet") validateWorkbook([{ name: op.name, rows: op.rows }]);
      if (op.op === "set_range") {
        const start = parseCellAddress(op.startCell);
        const width = op.values.reduce((n, r) => Math.max(n, r.length), 0);
        if (!start || start.row + op.values.length > MAX_ROWS || start.col + width > MAX_COLS)
          throw new Error("Range exceeds supported bounds.");
      }
      switch (op.op) {
        case "create_sheet": {
          const width = op.rows.reduce((m, r) => Math.max(m, r.length), 1);
          if (width * op.rows.length > MAX_CELLS) throw new Error("Cell limit exceeded.");
          const rows = op.rows.map((r) => padRow(r, width));
          const existing = findSheet(sheets, op.name);
          if (existing) existing.rows = rows;
          else sheets.push({ name: op.name, rows });
          break;
        }
        case "delete_sheet": {
          const dependency = sheets.find(
            (sheet) =>
              sheet.name.toLowerCase() !== op.name.toLowerCase() &&
              sheet.rows.some((row) =>
                row.some(
                  (value) =>
                    value.trimStart().startsWith("=") &&
                    (collectRefs(value).some(
                      (ref) => ref.sheet?.toLowerCase() === op.name.toLowerCase(),
                    ) ||
                      /\bINDIRECT\s*\(/i.test(value)),
                ),
              ),
          );
          if (dependency)
            throw new Error(
              `Cannot delete "${op.name}": formulas in "${dependency.name}" may depend on it. Remove those references first.`,
            );
          const before = sheets.length;
          sheets = sheets.filter((s) => s.name.toLowerCase() !== op.name.toLowerCase());
          if (sheets.length === before) problems.push(`delete_sheet: "${op.name}" does not exist.`);
          break;
        }
        case "rename_sheet": {
          const target = findSheet(sheets, op.from);
          if (!target) {
            problems.push(`rename_sheet: "${op.from}" does not exist.`);
            break;
          }
          target.name = op.to;
          break;
        }
        case "set_cells": {
          const target = findSheet(sheets, op.sheet);
          if (!target) {
            problems.push(`set_cells: sheet "${op.sheet}" does not exist.`);
            break;
          }
          for (const c of op.cells) {
            const pos = parseCellAddress(c.a1);
            if (!pos) {
              problems.push(`set_cells: "${c.a1}" is not a valid cell reference.`);
              continue;
            }
            while (target.rows.length <= pos.row) target.rows.push([]);
            if (target.rows.length * Math.max(widthOf(target), pos.col + 1) > MAX_CELLS)
              throw new Error("Cell limit exceeded.");
            padSheet(target, Math.max(widthOf(target), pos.col + 1));
            (target.rows[pos.row] as string[])[pos.col] = c.value;
          }
          break;
        }
        case "set_range": {
          const target = findSheet(sheets, op.sheet);
          if (!target) {
            problems.push(`set_range: sheet "${op.sheet}" does not exist.`);
            break;
          }
          const start = parseCellAddress(op.startCell);
          if (!start) {
            problems.push(`set_range: "${op.startCell}" is not a valid cell reference.`);
            break;
          }
          const neededWidth = start.col + Math.max(1, ...op.values.map((r) => r.length));
          while (target.rows.length < start.row + op.values.length) target.rows.push([]);
          if (target.rows.length * Math.max(widthOf(target), neededWidth) > MAX_CELLS)
            throw new Error("Cell limit exceeded.");
          padSheet(target, Math.max(widthOf(target), neededWidth));
          op.values.forEach((row, ri) => {
            row.forEach((value, ci) => {
              (target.rows[start.row + ri] as string[])[start.col + ci] = value;
            });
          });
          break;
        }
        case "insert_rows": {
          const target = findSheet(sheets, op.sheet);
          if (!target) {
            problems.push(`insert_rows: sheet "${op.sheet}" does not exist.`);
            break;
          }
          const width = Math.max(
            widthOf(target),
            op.rows.reduce((m, r) => Math.max(m, r.length), 1),
          );
          if (width > MAX_COLS || width * (target.rows.length + op.rows.length) > MAX_CELLS)
            throw new Error("Cell limit exceeded.");
          padSheet(target, width);
          const at = Math.min(Math.max(op.atRow - 1, 0), target.rows.length);
          target.rows.splice(at, 0, ...op.rows.map((r) => padRow(r, width)));
          break;
        }
        case "delete_rows": {
          const target = findSheet(sheets, op.sheet);
          if (!target) {
            problems.push(`delete_rows: sheet "${op.sheet}" does not exist.`);
            break;
          }
          target.rows.splice(Math.max(op.atRow - 1, 0), op.count);
          break;
        }
      }
      validateWorkbook(sheets);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
    if (problems.length) return { sheets: current, problems };
  }
  return { sheets, problems };
}
