import type { Sheet } from "./spreadsheet";
import { numericValue } from "./workbook-intelligence.ts";

export type Assumption = {
  /** Sheet index / row / col of the driver cell. */
  sheet: number;
  row: number;
  col: number;
  label: string;
  value: number;
  isPercent: boolean;
};

const KEYWORDS =
  /(growth|margin|rate|wacc|discount|churn|tax|multiple|inflation|escalat|price|terminal|exit|interest|utilis|utiliz)/i;

/** Find up to `limit` numeric driver cells that look like key model assumptions. */
export function findAssumptions(sheets: Sheet[], limit = 5): Assumption[] {
  const out: Assumption[] = [];
  sheets.forEach((s, si) => {
    s.rows.forEach((row, ri) => {
      const label = row[0] ?? "";
      if (!KEYWORDS.test(label)) return;
      for (let ci = 1; ci < row.length; ci++) {
        const raw = (row[ci] ?? "").trim();
        if (!raw || raw.startsWith("=")) continue;
        const pct = raw.endsWith("%");
        const n = numericValue(raw);
        if (n === null) continue;
        const isPercent =
          pct ||
          (Math.abs(n) < 1 &&
            /growth|margin|rate|wacc|discount|churn|tax|inflation|escalat|utilis|utiliz/i.test(
              label,
            ));
        out.push({ sheet: si, row: ri, col: ci, label, value: isPercent ? n * 100 : n, isPercent });
        return;
      }
    });
  });
  return out.slice(0, limit);
}

export function findModelControl(sheets: Sheet[], kind: "scenario" | "depreciation") {
  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si]!;
    for (let ri = 0; ri < sheet.rows.length; ri++) {
      const row = sheet.rows[ri]!,
        label = (row[0] ?? "").trim(),
        raw = row[1] ?? "";
      if (raw.startsWith("=")) continue;
      const numericCase = /^Active scenario \(1\s*=/i.test(label);
      if (
        kind === "scenario" &&
        (/^(Selected case|Active case|Scenario)$/i.test(label) || numericCase)
      ) {
        return {
          sheet: si,
          row: ri,
          numericCase,
          value: numericCase ? (["Base", "Upside", "Downside"][Number(raw) - 1] ?? "Base") : raw,
        };
      }
      if (kind === "depreciation" && /^Depreciation method(?:\s*\(|$)/i.test(label))
        return { sheet: si, row: ri, numericCase: false, value: raw };
    }
  }
  return null;
}
export function updateModelControl(
  sheets: Sheet[],
  kind: "scenario" | "depreciation",
  value: string,
): Sheet[] {
  const target = findModelControl(sheets, kind);
  const choices =
    kind === "scenario"
      ? ["Base", "Upside", "Downside"]
      : ["Straight-Line", "Double Declining", "MACRS"];
  if (!target || !choices.includes(value)) return sheets;
  return sheets.map((sheet, si) =>
    si !== target.sheet
      ? sheet
      : {
          ...sheet,
          rows: sheet.rows.map((row, ri) =>
            ri !== target.row
              ? row
              : [
                  row[0] ?? "",
                  target.numericCase ? String(choices.indexOf(value) + 1) : value,
                  ...row.slice(2),
                ],
          ),
        },
  );
}
