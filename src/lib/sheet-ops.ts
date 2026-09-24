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
    atRow: z.number().int().min(1).max(10000),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    op: z.literal("delete_rows"),
    sheet: z.string(),
    atRow: z.number().int().min(1).max(10000),
    count: z.number().int().min(1).max(10000),
  }),
]);

export type SheetOp = z.infer<typeof SheetOpSchema>;

export { applyOperations } from "./workbook-operations";
export type { OpResult } from "./workbook-operations";
