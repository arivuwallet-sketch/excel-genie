import type { Sheet } from "./spreadsheet";

/** Industry-standard modelling colours. */
const INPUT_BLUE = "FF0000FF";
const FORMULA_BLACK = "FF000000";
const LINK_GREEN = "FF008000";
const EXTERNAL_RED = "FF8B0000";
const HEADER_BG = "FF1F3A2E";
const TITLE_BG = "FFE8F3EC";

const isNumeric = (v: string) => /^-?\(?\$?-?[\d,]+(\.\d+)?\)?%?$/.test(v.trim()) && /\d/.test(v);

function toNumber(v: string): number | null {
  const neg = /^\(.*\)$/.test(v.trim());
  const cleaned = v.replace(/[(),$\s]/g, "").replace(/%$/, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || cleaned === "") return null;
  const scaled = v.trim().endsWith("%") ? n / 100 : n;
  return neg ? -Math.abs(scaled) : scaled;
}

function formulaColor(f: string) {
  if (/\[.+\]/.test(f)) return EXTERNAL_RED; // external workbook reference
  if (/'[^']+'!|\b[A-Za-z0-9_]+!\$?[A-Z]/.test(f)) return LINK_GREEN; // cross-sheet link
  return FORMULA_BLACK;
}

/** Export sheets to a styled, formula-driven .xlsx and trigger a download. */
export async function downloadStyledWorkbook(sheets: Sheet[], filename = "sheetsmith") {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "SheetSmith";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31) || "Sheet1", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const width = sheet.rows.reduce((m, r) => Math.max(m, r.length), 1);

    sheet.rows.forEach((row, r) => {
      const target = ws.getRow(r + 1);
      for (let c = 0; c < width; c++) {
        const raw = row[c] ?? "";
        const cell = target.getCell(c + 1);
        cell.font = { name: "Arial", size: 10 };

        if (raw.startsWith("=")) {
          cell.value = { formula: raw.slice(1) };
          cell.font = { ...cell.font, color: { argb: formulaColor(raw) } };
          cell.numFmt = raw.includes("%") ? "0.0%" : "$#,##0;($#,##0);-";
          cell.alignment = { horizontal: "right" };
        } else if (isNumeric(raw)) {
          const n = toNumber(raw);
          cell.value = n ?? raw;
          cell.font = { ...cell.font, color: { argb: INPUT_BLUE } };
          cell.numFmt = raw.trim().endsWith("%")
            ? "0.0%"
            : /^\d{4}$/.test(raw.trim())
              ? "@"
              : "$#,##0;($#,##0);-";
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

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
