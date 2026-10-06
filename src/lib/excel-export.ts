import { numericValue } from "./workbook-intelligence.ts";
import { calculateWorkbook } from "./calculation.ts";
import { sanitizeSheetName, stripIllegalXmlChars, type Sheet } from "./spreadsheet.ts";
import { isoDateSerial } from "./calculator/evaluate.ts";

const DATE_FMT = "yyyy-mm-dd";

/** Industry-standard modelling colours. */
const INPUT_BLUE = "FF0000FF";
const FORMULA_BLACK = "FF000000";
const LINK_GREEN = "FF008000";
const EXTERNAL_RED = "FF8B0000";
const HEADER_BG = "FF1F3A2E";
const TITLE_BG = "FFE8F3EC";

export const isNumeric = (v: string) => numericValue(v) !== null;
export const toNumber = numericValue;

function formulaColor(f: string) {
  if (/\[.+\]/.test(f)) return EXTERNAL_RED; // external workbook reference
  if (/'[^']+'!|\b[A-Za-z0-9_]+!\$?[A-Z]/.test(f)) return LINK_GREEN; // cross-sheet link
  return FORMULA_BLACK;
}

const CURRENCY_FMT = "$#,##0;($#,##0);-";
const CURRENCY_CENTS_FMT = "$#,##0.00;($#,##0.00);-";
const PERCENT_FMT = "0.0%;(0.0%);-";
const MULTIPLE_FMT = '0.00"x";(0.00"x");-';
const RATIO_FMT = "#,##0.00;(#,##0.00);-";
const COUNT_FMT = "#,##0;(#,##0);-";

const PERCENT_RE =
  /(%|\bpct\b|percent|(?<!run-)\brate\b|rates\b|margin|growth|retention|churn|yield|irr|wacc|cagr|cost of (equity|debt|capital)|tax rate|discount rate|utili[sz]ation|occupancy|allocation|weight|share of|contribution|payout|escalat|inflation|attrition|conversion|uplift|premium %|spread|win rate|hit rate|variance %|yoy|mom\b|qoq|change %|% change|mix\b|penetration|completion|vs\.? (prior|previous|last|budget|target|plan))/i;
const MULTIPLE_RE =
  /(multiple|moic|\bx\b|ev\/|p\/e|ebitda\/|turnover|dscr|llcr|coverage|\bbeta\b|\bratio\b|current ratio|quick ratio|magic number|leverage)/i;
const COUNT_RE =
  /(\bcounts?\b|number of|#|headcount|units|qty|quantity|\bdays\b|periods|employees|customers|logos|shares outstanding|iterations|orders|deals|transactions|tickets|visits|leads|\bitems\b)/i;
/** Explicit money units in a label beat rate words, e.g. "Freight rate ($/mt)". */
const MONEY_UNIT_RE =
  /(\$|\busd\b|\beur\b|\bgbp\b|£|€|\(\$?k\)|\(\$?mm?\)|per unit|\/unit|\/mt|\/hr|\/hour)/i;

/** Format chosen from label text alone, or null when the text carries no signal. */
function formatFromLabel(ctx: string, raw: string, value: number | null, currency: string) {
  const percentLabel = /%|\bpct\b|percent/i.test(ctx);
  if (!percentLabel && MONEY_UNIT_RE.test(ctx)) return currency;
  if (PERCENT_RE.test(ctx)) {
    // A typed whole number like 8 or 12 under a rate label is not 800% — keep it a plain figure.
    // Formula results keep percent (a computed 2.5 growth really is 250%).
    if (!raw.startsWith("=") && value !== null && Math.abs(value) >= 2) return RATIO_FMT;
    return PERCENT_FMT;
  }
  if (MULTIPLE_RE.test(ctx)) return MULTIPLE_FMT;
  if (COUNT_RE.test(ctx)) return COUNT_FMT;
  return null;
}

/**
 * Decide the number format for a cell from its row label and column header.
 * `ownLabel` is set when the row label sits in column A of a key/value row: its unit
 * (e.g. "Threshold (days)") then outranks unrelated text above the cell (e.g. "USD").
 */
function pickFormat(
  rowLabel: string,
  colHeader: string,
  raw: string,
  value: number | null,
  currency = CURRENCY_FMT,
  ownLabel = false,
) {
  if (raw.includes("%")) return PERCENT_FMT;
  if (ownLabel) {
    const own = formatFromLabel(rowLabel, raw, value, currency);
    if (own) return own;
  }
  const labelled = formatFromLabel(`${rowLabel} ${colHeader}`, raw, value, currency);
  if (labelled) return labelled;
  // A bare fraction that is clearly not money (e.g. 0.24, 1.35) reads better as a ratio.
  if (value !== null && Math.abs(value) > 0 && Math.abs(value) < 1) return PERCENT_FMT;
  if (value !== null && !Number.isInteger(value) && Math.abs(value) < 100 && !/\$/.test(raw))
    return currency === CURRENCY_FMT ? RATIO_FMT : currency;
  return currency;
}

/** Transaction-level workbooks (ledgers, statements, reconciliations) are kept to the cent. */
function usesCents(sheets: Sheet[]) {
  let numbers = 0,
    cents = 0;
  for (const s of sheets)
    for (const row of s.rows)
      for (const v of row) {
        if (!isNumeric(v)) continue;
        numbers++;
        if (/^-?\$?[\d,]+\.\d{1,2}$/.test(v.trim()) && !/\.0+$/.test(v.trim())) cents++;
      }
  return cents >= 5 && cents / Math.max(1, numbers) >= 0.15;
}

const isLabel = (v: string | undefined) =>
  !!v && !v.startsWith("=") && !isNumeric(v) && /[A-Za-z]/.test(v);

/** Nearest text label to the left of a cell in the same row (handles labels outside column A). */
function rowLabelFor(row: string[], c: number) {
  for (let i = c - 1; i >= 0; i--) if (isLabel(row[i])) return row[i]!;
  return "";
}

/** Nearest text header above a cell in the same column (handles stacked blocks/dashboards). */
function colHeaderFor(rows: string[][], r: number, c: number) {
  for (let i = r - 1; i >= 0 && i >= r - 40; i--) if (isLabel(rows[i]?.[c])) return rows[i]![c]!;
  return "";
}

const YEAR_RE = /^(19|20)\d{2}$/;
/** A 4-digit value is a year only in a year context — not an amount like 9600 in a ledger. */
function isYearCell(rows: string[][], r: number, c: number, raw: string, ctx: string) {
  if (!YEAR_RE.test(raw.trim())) return false;
  if (/\b(year|yr|fy|vintage|cohort|period)\b/i.test(ctx)) return true;
  // Timeline header rows: every number in the row is a year.
  const nums = (rows[r] ?? []).filter((v) => isNumeric(v));
  return nums.length >= 2 && nums.every((v) => YEAR_RE.test(v.trim()));
}

/** Build the styled, formula-driven workbook. Pure — no browser APIs — so it's directly testable. */
export async function buildStyledWorkbook(sheets: Sheet[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  wb.creator = "SheetSmith";
  wb.created = new Date();

  const safeSheets = sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [["No data"]] }];
  const usedNames = new Set<string>();

  // Preview formula results so formatting reflects what each formula actually returns.
  let computed: Sheet[] | null = null;
  try {
    computed = calculateWorkbook(safeSheets).sheets;
  } catch {
    computed = null;
  }

  const currency = usesCents(safeSheets) ? CURRENCY_CENTS_FMT : CURRENCY_FMT;

  for (const [s, sheet] of safeSheets.entries()) {
    const ws = wb.addWorksheet(sanitizeSheetName(sheet.name, usedNames), {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const width = sheet.rows.reduce((m, r) => Math.max(m, r.length), 1);

    sheet.rows.forEach((row, r) => {
      const target = ws.getRow(r + 1);
      for (let c = 0; c < width; c++) {
        const raw = stripIllegalXmlChars(row[c] ?? "");
        const cell = target.getCell(c + 1);
        cell.font = { name: "Arial", size: 10 };
        const rowLabel = rowLabelFor(row, c);
        const colHeader = colHeaderFor(sheet.rows, r, c);
        const ownLabel = c === 1 && rowLabel === row[0];

        if (raw.startsWith("=") && raw.slice(1).trim()) {
          cell.value = { formula: raw.slice(1) };
          cell.font = { ...cell.font, color: { argb: formulaColor(raw) } };
          const shown = computed?.[s]?.rows[r]?.[c] ?? "";
          const preview = toNumber(shown);
          // A formula that returns a date (e.g. =Setup!B9) must display as a date, never as $46,112.
          cell.numFmt =
            isoDateSerial(shown) !== null
              ? DATE_FMT
              : pickFormat(rowLabel, colHeader, raw, preview, currency, ownLabel);
          cell.alignment = { horizontal: "right" };
        } else if (isoDateSerial(raw) !== null) {
          // Real Excel dates so date arithmetic, sorting and filters work natively.
          const [y, m, d] = raw.trim().split("-").map(Number);
          cell.value = new Date(Date.UTC(y, m - 1, d));
          cell.numFmt = DATE_FMT;
          cell.font = { ...cell.font, color: { argb: INPUT_BLUE } };
          cell.alignment = { horizontal: "right" };
        } else if (isNumeric(raw)) {
          const n = toNumber(raw);
          cell.value = n ?? raw;
          cell.font = { ...cell.font, color: { argb: INPUT_BLUE } };
          cell.numFmt = isYearCell(sheet.rows, r, c, raw, `${rowLabel} ${colHeader}`)
            ? "0" // years read as 2026, never $2,026
            : pickFormat(rowLabel, colHeader, raw, n, currency, ownLabel);
          cell.alignment = { horizontal: "right" };
        } else {
          cell.value = raw;
        }

        // Title row / section banners
        if (r === 0) {
          cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
        } else if (c === 0 && raw && raw === raw.toUpperCase() && /[A-Z]{3}/.test(raw)) {
          cell.font = { ...cell.font, bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };
        }

        // Highlight balance / check rows that must equal zero
        if (/check|must be 0|balance check/i.test(row[0] ?? "") && c > 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
        }
      }
      target.commit();
    });

    for (let c = 1; c <= width; c++) {
      const header = String(sheet.rows[1]?.[c - 1] ?? "");
      ws.getColumn(c).width = c === 1 ? 34 : Math.max(12, Math.min(22, header.length + 6));
    }
  }

  return wb;
}

/** Export sheets to a styled, formula-driven .xlsx and trigger a download. */
export async function downloadStyledWorkbook(sheets: Sheet[], filename = "sheetsmith") {
  const wb = await buildStyledWorkbook(sheets);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
