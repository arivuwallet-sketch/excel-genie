import type { Sheet } from "./spreadsheet";

export type AuditIssue = {
  sheet: string;
  cell: string;
  formula: string;
  kind: "missing-sheet" | "out-of-range" | "empty-ref" | "unguarded-division" | "text-in-math";
  detail: string;
};

export type AuditReport = {
  sheets: Sheet[];
  fixes: string[];
  issues: AuditIssue[];
};

const A1 = (row: number, col: number) => `${colName(col)}${row + 1}`;

function colName(col: number) {
  let n = col + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function colIndex(name: string) {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Replace string literals with placeholders so refs inside text are ignored. */
function stripLiterals(formula: string) {
  return formula.replace(/"(?:[^"]|"")*"/g, (m) => " ".repeat(m.length));
}

const REF_RE =
  /(?:(?:'([^']*)'|([A-Za-z0-9_]+))!)?(\$?[A-Z]{1,3}\$?\d{1,7})(?::(\$?[A-Z]{1,3}\$?\d{1,7}))?/g;

type Ref = {
  sheet: string | null;
  start: { row: number; col: number };
  end: { row: number; col: number };
  text: string;
  index: number;
};

function parseCell(ref: string) {
  const m = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/.exec(ref);
  if (!m) return null;
  return { col: colIndex(m[1] as string), row: Number(m[2]) - 1 };
}

/** Collect every A1 reference in a formula, ignoring text literals. */
export function collectRefs(formula: string): Ref[] {
  const scrubbed = stripLiterals(formula);
  const out: Ref[] = [];
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(scrubbed))) {
    const before = scrubbed[m.index - 1] ?? "";
    if (/[A-Za-z0-9_$.]/.test(before) && !m[1] && !m[2]) continue;
    const start = parseCell(m[3] as string);
    if (!start) continue;
    const end = m[4] ? parseCell(m[4]) : start;
    if (!end) continue;
    out.push({
      sheet: (m[1] ?? m[2] ?? null) as string | null,
      start,
      end,
      text: m[0],
      index: m.index,
    });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function similarity(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const set = new Set(x.split(""));
  let hits = 0;
  for (const ch of new Set(y.split(""))) if (set.has(ch)) hits += 1;
  return hits / Math.max(set.size, new Set(y.split("")).size);
}

function bestSheetMatch(name: string, sheets: Sheet[]) {
  let best: { name: string; score: number } | null = null;
  for (const s of sheets) {
    const score = similarity(name, s.name);
    if (!best || score > best.score) best = { name: s.name, score };
  }
  return best && best.score >= 0.55 ? best.name : null;
}

const quote = (name: string) => (/^[A-Za-z0-9_]+$/.test(name) ? name : `'${name}'`);

const cellAt = (sheet: Sheet | undefined, row: number, col: number) =>
  (sheet?.rows[row]?.[col] ?? "").trim();

const isBlankRange = (sheet: Sheet, r: Ref) => {
  for (let row = r.start.row; row <= Math.min(r.end.row, r.start.row + 5000); row += 1) {
    for (let col = r.start.col; col <= r.end.col; col += 1) {
      if (cellAt(sheet, row, col) !== "") return false;
    }
  }
  return true;
};

const rangeOutOfBounds = (sheet: Sheet, r: Ref) => {
  const height = sheet.rows.length;
  return r.start.row >= height;
};

const MATH_ONLY = /^=[-+]?[\s$A-Z0-9.!'":,()*/+%-]+$/i;

/**
 * Audit a workbook and auto-repair the mechanical problems:
 * broken cross-sheet names, and division that can blow up to #DIV/0!.
 * Anything that needs judgement is returned as an issue instead.
 */
export function auditAndRepair(input: Sheet[]): AuditReport {
  const sheets = input.map((s) => ({ name: s.name, rows: s.rows.map((r) => [...r]) }));
  const byName = new Map(sheets.map((s) => [norm(s.name), s]));
  const fixes: string[] = [];
  const issues: AuditIssue[] = [];

  for (const sheet of sheets) {
    for (let row = 0; row < sheet.rows.length; row += 1) {
      const line = sheet.rows[row] as string[];
      for (let col = 0; col < line.length; col += 1) {
        const raw = (line[col] ?? "").trim();
        if (!raw.startsWith("=")) continue;
        let formula = raw;
        const at = `${sheet.name}!${A1(row, col)}`;

        // 1. repair references to sheets that do not exist
        const refs = collectRefs(formula);
        const rewrites = new Map<string, string>();
        for (const r of refs) {
          if (!r.sheet) continue;
          if (byName.has(norm(r.sheet))) continue;
          const match = bestSheetMatch(r.sheet, sheets);
          if (match) {
            rewrites.set(r.sheet, match);
          } else {
            issues.push({
              sheet: sheet.name,
              cell: A1(row, col),
              formula,
              kind: "missing-sheet",
              detail: `References sheet "${r.sheet}", which is not in this workbook.`,
            });
          }
        }
        for (const [from, to] of rewrites) {
          const pattern = new RegExp(`(?:'${escapeRe(from)}'|${escapeRe(from)})!`, "g");
          formula = formula.replace(pattern, `${quote(to)}!`);
          fixes.push(`${at}: re-pointed "${from}" to existing sheet "${to}".`);
        }

        // 2. guard division and lookups so no #DIV/0! or #N/A cascade
        if (/\//.test(stripLiterals(formula)) && !/IFERROR|IFNA/i.test(formula)) {
          formula = `=IFERROR(${formula.slice(1)},0)`;
          fixes.push(`${at}: wrapped division in IFERROR to stop #DIV/0!.`);
        } else if (
          /\b(VLOOKUP|HLOOKUP|MATCH|INDEX|XLOOKUP|SEARCH|FIND)\s*\(/i.test(formula) &&
          !/IFERROR|IFNA|ISNUMBER|ISERROR|ISNA|IFS?\s*\(/i.test(formula)
        ) {
          formula = `=IFERROR(${formula.slice(1)},"")`;
          fixes.push(`${at}: wrapped lookup in IFERROR to stop #N/A.`);
        }

        // 3. flag references that point at nothing / off the end of a sheet
        for (const r of collectRefs(formula)) {
          const target = r.sheet ? byName.get(norm(r.sheet)) : sheet;
          if (!target) continue;
          if (rangeOutOfBounds(target, r)) {
            issues.push({
              sheet: sheet.name,
              cell: A1(row, col),
              formula,
              kind: "out-of-range",
              detail: `${r.text} sits past the last row of "${target.name}".`,
            });
          } else if (MATH_ONLY.test(formula) && isBlankRange(target, r)) {
            issues.push({
              sheet: sheet.name,
              cell: A1(row, col),
              formula,
              kind: "empty-ref",
              detail: `${r.text} is empty, so this calculation has no data behind it.`,
            });
          } else if (
            r.start.row === r.end.row &&
            r.start.col === r.end.col &&
            /[-+*/]/.test(stripLiterals(formula).replace(/^=/, "")) &&
            isTextCell(cellAt(target, r.start.row, r.start.col))
          ) {
            issues.push({
              sheet: sheet.name,
              cell: A1(row, col),
              formula,
              kind: "text-in-math",
              detail: `${r.text} holds text ("${cellAt(target, r.start.row, r.start.col).slice(0, 24)}"), so the maths cannot resolve.`,
            });
          }
        }

        line[col] = formula;
      }
    }
  }

  return { sheets, fixes, issues: dedupe(issues) };
}

function isTextCell(value: string) {
  if (!value || value.startsWith("=")) return false;
  return !/^-?\(?\$?-?[\d,]+(\.\d+)?\)?%?$/.test(value);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe(issues: AuditIssue[]) {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.sheet}|${i.cell}|${i.kind}|${i.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeIssues(issues: AuditIssue[]) {
  return issues
    .slice(0, 30)
    .map((i) => `- ${i.sheet}!${i.cell} [${i.kind}] ${i.detail} FORMULA: ${i.formula}`)
    .join("\n");
}
