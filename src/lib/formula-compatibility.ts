import type { Sheet } from "./spreadsheet";

const MODERN = new Set([
  "GROUPBY",
  "PIVOTBY",
  "PERCENTOF",
  "REGEXTEST",
  "REGEXEXTRACT",
  "REGEXREPLACE",
  "LET",
  "LAMBDA",
  "MAP",
  "REDUCE",
  "SCAN",
  "BYROW",
  "BYCOL",
  "FILTER",
  "UNIQUE",
  "SORT",
  "SORTBY",
  "SEQUENCE",
  "RANDARRAY",
  "CHOOSECOLS",
  "TEXTSPLIT",
]);
const CONNECTED = new Set(["PY", "COPILOT", "GPT", "GPT_EXTRACT", "GPT_CLASSIFY"]);

/** Capability notices describe this app, not a promise about a user's Excel subscription. */
export function formulaCompatibility(sheets: Sheet[]) {
  const modern = new Set<string>(),
    connected = new Set<string>();
  let formulaCount = 0;
  for (const sheet of sheets)
    for (const row of sheet.rows)
      for (const cell of row) {
        if (!cell.trimStart().startsWith("=")) continue;
        formulaCount++;
        const scrubbed = cell.replace(/"(?:[^"]|"")*"/g, "");
        for (const match of scrubbed.matchAll(
          /\b(?:_xlfn\.)?(?:_xlws\.)?([A-Z][A-Z0-9_.]*)\s*\(/gi,
        )) {
          const name = match[1]!.toUpperCase();
          if (MODERN.has(name)) modern.add(name);
          if (CONNECTED.has(name)) connected.add(name);
        }
      }
  return { formulaCount, modern: [...modern].sort(), connected: [...connected].sort() };
}

export const MODERN_FORMULA_GUIDANCE = `
MODERN EXCEL COMPATIBILITY:
Prefer GROUPBY/PIVOTBY for dynamic aggregation and REGEXTEST/REGEXEXTRACT/REGEXREPLACE for text work when the user targets a compatible Excel version. Prefer LET/LAMBDA for reusable logic and FILTER/UNIQUE/SORT for dynamic reports. Explain version requirements and offer conventional formulas for older Excel.
This app stores and exports formulas but does not calculate them. Never claim browser execution of Excel, Python, VBA, COPILOT or custom GPT functions. PY, COPILOT and GPT-family functions need separate supported services or add-ins; a formula string alone does not provision them. Provide setup guidance or code examples, not a claim of a working integration.
Spill ranges must remain empty in all output directions, including columns. IFERROR/IFNA do not clear occupied spill cells or guarantee the absence of #SPILL!. Do not hide balance-check failures behind zero fallbacks. Do not create structured table references, named functions or names unless they already exist in the supplied context and the export preserves them; the app only represents named worksheets and A1 cell contents.
`;
