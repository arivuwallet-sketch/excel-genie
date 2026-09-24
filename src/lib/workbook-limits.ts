import type { Sheet } from './spreadsheet';
export const MAX_ROWS = 10000, MAX_COLS = 256, MAX_CELLS = 250000, MAX_SHEETS = 30, MAX_CELL_LENGTH = 10000;
export function validateWorkbook(sheets: Sheet[]): void {
  if (!sheets.length || sheets.length > MAX_SHEETS) throw new Error(`Use between 1 and ${MAX_SHEETS} sheets.`);
  const names = new Set<string>(); let cells = 0;
  for (const sheet of sheets) {
    if (!sheet.name.trim() || sheet.name.length > 31 || /[:\\/?*\[\]]/.test(sheet.name) || /^'|'$/.test(sheet.name)) throw new Error(`Invalid worksheet name: ${sheet.name}`);
    if (names.has(sheet.name.toLowerCase())) throw new Error(`Duplicate worksheet name: ${sheet.name}. Rename sheets before combining files.`);
    names.add(sheet.name.toLowerCase());
    if (sheet.rows.length > MAX_ROWS) throw new Error(`Each sheet supports at most ${MAX_ROWS.toLocaleString()} rows.`);
    for (const row of sheet.rows) {
      cells += row.length;
      if (row.length > MAX_COLS || cells > MAX_CELLS) throw new Error(`Workbook limit: ${MAX_COLS} columns per sheet and ${MAX_CELLS.toLocaleString()} cells total.`);
      if (row.some(c => typeof c !== 'string' || c.length > MAX_CELL_LENGTH)) throw new Error(`Cell text must be at most ${MAX_CELL_LENGTH} characters.`);
    }
  }
}
export function parseCellAddress(ref: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?([1-9]\d*)$/.exec(ref.trim()); if (!m) return null;
  let col = 0; for (const ch of m[1]!.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  const row = Number(m[2]); return row <= MAX_ROWS && col <= MAX_COLS ? { row: row - 1, col: col - 1 } : null;
}
