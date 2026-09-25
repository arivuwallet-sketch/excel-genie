import Papa from "papaparse";
import * as XLSX from "xlsx/xlsx.mjs";
import { MAX_ROWS, MAX_COLS, MAX_CELLS, MAX_SHEETS, validateWorkbook } from "./workbook-limits.ts";
import { numericValue } from "./workbook-intelligence.ts";

export type Sheet = { name: string; rows: string[][] };

export const UNSUPPORTED_EXT = [
  "xlc",
  "wk1",
  "wk2",
  "wk3",
  "wk4",
  "wks",
  "fmt",
  "fm3",
  "wq1",
  "wb1",
  "wb3",
];

export const SUPPORTED_EXT = [
  "xlsx",
  "xlsm",
  "xlsb",
  "xltx",
  "xltm",
  "xls",
  "xlt",
  "xml",
  "xlam",
  "xla",
  "xlw",
  "xlr",
  "prn",
  "txt",
  "csv",
  "dif",
  "slk",
  "dbf",
  "ods",
];

export const ACCEPT_ATTR = [...SUPPORTED_EXT, ...UNSUPPORTED_EXT].map((e) => `.${e}`).join(",");

export function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function normalize(aoa: unknown[][]): string[][] {
  const width = aoa.reduce<number>((max, row) => Math.max(max, row?.length ?? 0), 0);
  if (aoa.length > MAX_ROWS || width > MAX_COLS || aoa.length * width > MAX_CELLS)
    throw new Error("Data exceeds supported workbook limits.");
  return aoa.map((row) =>
    Array.from({ length: Math.max(width, 1) }, (_, i) => {
      const v = row?.[i];
      return v === null || v === undefined ? "" : String(v);
    }),
  );
}

export function workbookToSheets(wb: XLSX.WorkBook): Sheet[] {
  if (wb.SheetNames.length > MAX_SHEETS) throw new Error(`Use at most ${MAX_SHEETS} sheets.`);
  let allocatedCells = 0;
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return { name, rows: [] as string[][] };
    const bounds = XLSX.utils.decode_range(ws["!ref"] || "A1");
    if (
      bounds.e.r >= MAX_ROWS ||
      bounds.e.c >= MAX_COLS ||
      (bounds.e.r + 1) * (bounds.e.c + 1) > MAX_CELLS
    )
      throw new Error("Worksheet exceeds supported limits.");
    allocatedCells += (bounds.e.r + 1) * (bounds.e.c + 1);
    if (allocatedCells > MAX_CELLS) throw new Error("Workbook exceeds supported cell limits.");
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
    const rows = normalize(aoa);
    for (let r = 0; r < rows.length; r++)
      for (let c = 0; c < (rows[r]?.length ?? 0); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: r + bounds.s.r, c: c + bounds.s.c })];
        if (cell?.f) rows[r]![c] = `=${cell.f}`;
        else if (cell?.t === "n" && typeof cell.v === "number") {
          // Keep full precision instead of importing rounded display text. Retain formatted dates
          // and zero-padded identifiers, which the string-grid model stores as text.
          const displayed = rows[r]![c] ?? "";
          if (!XLSX.SSF.is_date(cell.z ?? "") && !/^0\d/.test(displayed))
            rows[r]![c] = String(cell.v);
        }
      }
    return {
      name,
      rows: [
        ...Array.from({ length: bounds.s.r }, () => [] as string[]),
        ...rows.map((row) => [...Array(bounds.s.c).fill(""), ...row]),
      ],
    };
  });
  validateWorkbook(sheets);
  return sheets;
}

export async function parseFile(file: File): Promise<Sheet[]> {
  const ext = extOf(file.name);
  if (file.size > 20 * 1024 * 1024) throw new Error("Upload files smaller than 20 MB.");

  if (UNSUPPORTED_EXT.includes(ext)) {
    throw new Error(
      `.${ext} is a legacy format Excel no longer opens. Please convert it to .xlsx or .csv first, then re-upload.`,
    );
  }

  if (!SUPPORTED_EXT.includes(ext))
    throw new Error("Unsupported format. Convert to XLSX or CSV first.");

  if (ext === "csv" || ext === "txt" || ext === "prn") {
    const text = await file.text();
    return [
      {
        name: sanitizeSheetName(file.name.replace(/\.[^.]+$/, ""), new Set()),
        rows: parseDelimited(text),
      },
    ];
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {
    type: "array",
    cellFormula: true,
    cellStyles: true,
    cellNF: true,
    sheetStubs: true,
  });
  const sheets = workbookToSheets(wb);
  if (sheets.length === 0) throw new Error("No readable data found in this file.");
  validateWorkbook(sheets);
  return sheets;
}

export function parseDelimited(text: string): string[][] {
  if (text.length > 20 * 1024 * 1024) throw new Error("Text exceeds the 20 MB input limit.");
  if (!text) return [];
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: false,
  });
  // A terminal newline ends the last record; internal blank records retain their row positions.
  if (/[\r\n]$/.test(text) && parsed.data.at(-1)?.every((value) => value === "")) parsed.data.pop();
  if (parsed.errors.some((e) => e.code !== "UndetectableDelimiter"))
    throw new Error("Could not parse delimited data.");
  const rows = normalize(parsed.data as unknown[][]);
  validateWorkbook([{ name: "Imported", rows }]);
  return rows;
}

/** Parse clipboard payloads: HTML tables, tab-delimited text, RTF or plain text. */
export function parseClipboard(data: DataTransfer): Sheet[] | null {
  const html = data.getData("text/html");
  if (html && /<t[dr]\b/i.test(html)) {
    if (html.length > 20 * 1024 * 1024) throw new Error("Clipboard exceeds the 20 MB input limit.");
    const wb = XLSX.read(html, { type: "string" });
    const sheets = workbookToSheets(wb);
    if (sheets.length) return sheets.map((s, i) => ({ ...s, name: i === 0 ? "Pasted" : s.name }));
  }
  const rtf = data.getData("text/rtf");
  const plain = data.getData("text/plain") || (rtf ? stripRtf(rtf) : "");
  if (plain.trim()) return [{ name: "Pasted", rows: parseDelimited(plain) }];
  return null;
}

function stripRtf(rtf: string) {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\\\*?[^{}]*\}/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .trim();
}

/**
 * Excel worksheet names: at most 31 chars, none of : \ / ? * [ ], never blank, and unique within the
 * workbook (case-insensitive). `used` tracks lowercased names already assigned across one export.
 */
export function sanitizeSheetName(raw: string, used: Set<string>, fallback = "Sheet"): string {
  let base = raw
    .replace(/[:\\/?*[\]]/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
  if (!base) base = fallback;
  base = base.slice(0, 31).replace(/'+$/g, "").trim() || fallback;
  if (base.toLowerCase() === "history") base = "History Sheet";

  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Strip characters that are illegal in XML 1.0 (control characters other than tab/LF/CR, plus the
 * non-characters U+FFFE/U+FFFF). Stray control characters in AI-generated text are a classic cause of
 * Excel's "we found a problem with some content" repair dialog.
 */
export function stripIllegalXmlChars(s: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately matching illegal XML control chars
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
}

export function sheetsToWorkbook(sheets: Sheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  sheets.forEach((sheet, index) => {
    const clean = sheet.rows.map((row) =>
      row.map((cell) => {
        const c = stripIllegalXmlChars(cell);
        return c.startsWith("=") && c.slice(1).trim() ? { f: c.slice(1) } : (numericValue(c) ?? c);
      }),
    );
    const ws = XLSX.utils.aoa_to_sheet(clean);
    const widths = (sheet.rows[0] ?? []).map((_, c) => ({
      wch: Math.min(
        40,
        Math.max(10, ...sheet.rows.slice(0, 200).map((r) => (r[c] ?? "").length + 2)),
      ),
    }));
    ws["!cols"] = widths;
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      sanitizeSheetName(sheet.name, usedNames, `Sheet${index + 1}`),
    );
  });
  return wb;
}

export function downloadWorkbook(sheets: Sheet[], format: "xlsx" | "csv", filename = "analysis") {
  if (format === "csv") {
    const csv = Papa.unparse(sheets[0]?.rows ?? [], { escapeFormulae: true });
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const wb = sheetsToWorkbook(sheets);
  XLSX.writeFile(wb, `${filename}.${format}`, { bookType: format, compression: true });
}

export const emptySheet = (name = "Sheet1"): Sheet => ({
  name,
  rows: Array.from({ length: 20 }, () => Array.from({ length: 8 }, () => "")),
});
