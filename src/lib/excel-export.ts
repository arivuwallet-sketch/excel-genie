import { numericValue } from "./workbook-intelligence.ts";
import { sanitizeSheetName, stripIllegalXmlChars, type Sheet } from "./spreadsheet.ts";

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
const PERCENT_FMT = "0.0%;(0.0%);-";
const MULTIPLE_FMT = '0.00"x";(0.00"x");-';
const RATIO_FMT = "#,##0.00;(#,##0.00);-";
const COUNT_FMT = "#,##0;(#,##0);-";

const PERCENT_RE =
  /(%|\bpct\b|percent|\brate\b|rates\b|margin|growth|retention|churn|yield|irr|wacc|cagr|cost of (equity|debt|capital)|tax rate|discount rate|utili[sz]ation|occupancy|allocation|weight|share of|contribution|payout|escalat|inflation|attrition|conversion|uplift|premium %|spread)/i;
const MULTIPLE_RE =
  /(multiple|moic|\bx\b|ev\/|p\/e|ebitda\/|turnover|dscr|llcr|coverage|\bbeta\b|\bratio\b|current ratio|quick ratio|magic number|leverage)/i;
const COUNT_RE =
  /(count|number of|#|headcount|units|qty|quantity|days|periods|employees|customers|logos|shares outstanding|iterations)/i;

/** Decide the number format for a cell from its row label and column header. */
function pickFormat(rowLabel: string, colHeader: string, raw: string, value: number | null) {
  const ctx = `${rowLabel} ${colHeader}`;
  if (raw.includes("%") || PERCENT_RE.test(ctx)) return PERCENT_FMT;
  if (MULTIPLE_RE.test(ctx)) return MULTIPLE_FMT;
  if (COUNT_RE.test(ctx)) return COUNT_FMT;
  // A bare fraction that is clearly not money (e.g. 0.24, 1.35) reads better as a ratio.
  if (value !== null && Math.abs(value) > 0 && Math.abs(value) < 1) return PERCENT_FMT;
  if (value !== null && !Number.isInteger(value) && Math.abs(value) < 100 && !/\$/.test(raw))
    return RATIO_FMT;
  return CURRENCY_FMT;
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

  for (const sheet of safeSheets) {
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
        const colHeader = String(sheet.rows[1]?.[c] ?? "");

        if (raw.startsWith("=") && raw.slice(1).trim()) {
          cell.value = { formula: raw.slice(1) };
          cell.font = { ...cell.font, color: { argb: formulaColor(raw) } };
          cell.numFmt = pickFormat(row[0] ?? "", colHeader, raw, null);
          cell.alignment = { horizontal: "right" };
        } else if (isNumeric(raw)) {
          const n = toNumber(raw);
          cell.value = n ?? raw;
          cell.font = { ...cell.font, color: { argb: INPUT_BLUE } };
          cell.numFmt = /^\d{4}$/.test(raw.trim())
            ? "@" // a bare 4-digit number (e.g. a year) reads better as text than as currency
            : pickFormat(row[0] ?? "", colHeader, raw, n);
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
