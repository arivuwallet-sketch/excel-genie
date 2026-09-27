import type { Sheet } from "./spreadsheet";
export function requestPrerequisite(prompt: string, sheets: Sheet[]): string | null {
  const populated = sheets.filter((sheet) => sheet.rows.some((row) => row.some((v) => v.trim())));
  if (
    /\b(reconcile|reconciliation|match .*sheets|compare .*sheets)\b/i.test(prompt) &&
    populated.length < 2
  )
    return "Upload or create both source sheets first, then open Workflows → Reconcile. Choose the matching key and amount columns there. No data was changed.";
  if (
    !populated.length &&
    /\b(clean|audit|analy[sz]e|summari[sz]e|pivot|deduplicate)\b/i.test(prompt) &&
    !/\b(create|build|generate|template|example)\b/i.test(prompt)
  )
    return "This workbook is empty. Upload data or load a template first, then run the analysis. No data was changed.";
  return null;
}
