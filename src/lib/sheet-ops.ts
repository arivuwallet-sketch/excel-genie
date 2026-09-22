import { z } from "zod";

import type { Sheet } from "./spreadsheet";

/**
 * Surgical edit operations the AI emits instead of restating the whole
 * workbook. Applying them mechanically guarantees every sheet and row the
 * model did not mention comes through byte-identical on the other side —
 * the model can no longer silently drop or corrupt content it wasn't
 * asked to touch, and responses shrink to the size of the actual edit.
 */
const CellEditSchema = z.object({ a1: z.string(), value: z.string() });

export const SheetOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create_sheet"), name: z.string(), rows: z.array(z.array(z.string())) }),
  z.object({ op: z.literal("delete_sheet"), name: z.string() }),
  z.object({ op: z.literal("rename_sheet"), from: z.string(), to: z.string() }),
  z.object({ op: z.literal("set_cells"), sheet: z.string(), cells: z.array(CellEditSchema) }),
  z.object({
    op: z.literal("set_range"),
    sheet: z.string(),
    startCell: z.string(),
    values: z.array(z.array(z.string())),
  }),
  z.object({
    op: z.literal("insert_rows"),
    sheet: z.string(),
    atRow: z.number(),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    op: z.literal("delete_rows"),
    sheet: z.string(),
    atRow: z.number(),
    count: z.number(),
  }),
]);

export type SheetOp = z.infer<typeof SheetOpSchema>;

export type OpResult = {
  sheets: Sheet[];
  /** Operations that named a sheet or cell that doesn't resolve — applied best-effort, reported so the retry loop can ask the model to fix them. */
  problems: string[];
};

function colIndexOf(letters: string) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseA1(ref: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!m) return null;
  return { col: colIndexOf(m[1] as string), row: Number(m[2]) - 1 };
}

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
  let sheets: Sheet[] = current.map((s) => ({ name: s.name, rows: s.rows.map((r) => [...r]) }));
  const problems: string[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "create_sheet": {
        const width = op.rows.reduce((m, r) => Math.max(m, r.length), 1);
        const rows = op.rows.map((r) => padRow(r, width));
        const existing = findSheet(sheets, op.name);
        if (existing) existing.rows = rows;
        else sheets.push({ name: op.name.slice(0, 31), rows });
        break;
      }
      case "delete_sheet": {
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
        target.name = op.to.slice(0, 31);
        break;
      }
      case "set_cells": {
        const target = findSheet(sheets, op.sheet);
        if (!target) {
          problems.push(`set_cells: sheet "${op.sheet}" does not exist.`);
          break;
        }
        for (const c of op.cells) {
          const pos = parseA1(c.a1);
          if (!pos) {
            problems.push(`set_cells: "${c.a1}" is not a valid cell reference.`);
            continue;
          }
          while (target.rows.length <= pos.row) target.rows.push([]);
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
        const start = parseA1(op.startCell);
        if (!start) {
          problems.push(`set_range: "${op.startCell}" is not a valid cell reference.`);
          break;
        }
        const neededWidth = start.col + Math.max(1, ...op.values.map((r) => r.length));
        while (target.rows.length < start.row + op.values.length) target.rows.push([]);
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
  }

  return { sheets, problems };
}