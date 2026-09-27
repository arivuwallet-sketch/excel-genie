import type { Sheet } from "./spreadsheet";
import { validateWorkbook } from "./workbook-limits.ts";

/** Disambiguate values-only files, but never silently break formula links by renaming. */
export function combineImports(batches: Sheet[][], existing: Sheet[] = []): Sheet[] {
  const output = [...existing],
    used = new Set(existing.map((s) => s.name.toLowerCase()));
  for (const batch of batches) {
    const hasFormulas = batch.some((s) =>
      s.rows.some((r) => r.some((v) => v.trimStart().startsWith("="))),
    );
    for (const sheet of batch) {
      let name = sheet.name;
      if (used.has(name.toLowerCase()) && hasFormulas)
        throw new Error(
          `The imported workbook has a conflicting sheet name "${name}" and contains formulas. Rename its sheets in Excel before adding it so formula links stay intact.`,
        );
      for (let i = 2; used.has(name.toLowerCase()); i++) {
        const suffix = ` (${i})`;
        name = `${sheet.name.slice(0, 31 - suffix.length)}${suffix}`;
      }
      used.add(name.toLowerCase());
      output.push({ ...sheet, name });
    }
  }
  validateWorkbook(output);
  return output;
}
