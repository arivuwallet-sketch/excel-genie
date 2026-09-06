import type { Sheet } from "@/lib/spreadsheet";

export type TemplateTier =
  | "Basic"
  | "Intermediate"
  | "Advanced"
  | "Quantitative"
  | "Dashboards"
  | "Institutional";

export type FinancialTemplate = {
  id: string;
  name: string;
  tier: TemplateTier;
  blurb: string;
  features: string[];
  /** Natural-language prompt used when the user wants the AI to extend this template. */
  prompt: string;
  build: () => Sheet[];
};

/** Build a sheet from a ragged array, padding every row to the widest one. */
export function S(name: string, rows: (string | number)[][]): Sheet {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 1);
  return {
    name: name.slice(0, 31),
    rows: rows.map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? ""))),
  };
}

export const BLANK: (string | number)[] = [];

/** Cross-sheet link marker: formulas referencing other sheets export in green. */
export const link = (formula: string) => formula;
