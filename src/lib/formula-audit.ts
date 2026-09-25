import type { Sheet } from "./spreadsheet";

export type AuditIssue = {
  sheet: string;
  cell: string;
  formula: string;
  kind:
    | "missing-sheet"
    | "out-of-range"
    | "empty-ref"
    | "unguarded-division"
    | "text-in-math"
    | "circular-ref"
    | "spill-blocked"
    | "audit-limit";
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
  /(?:(?:'((?:[^']|'')*)'|([A-Za-z0-9_]+))!)?(\$?[A-Z]{1,3}\$?\d{1,7})(?::(\$?[A-Z]{1,3}\$?\d{1,7}))?/gi;

type Ref = {
  sheet: string | null;
  start: { row: number; col: number };
  end: { row: number; col: number };
  text: string;
  index: number;
};

function parseCell(ref: string) {
  const m = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i.exec(ref);
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
    const after = scrubbed.slice(m.index + m[0].length);
    // Function names such as LOG10 and identifiers such as A1_total are not cell references.
    if (/^[A-Za-z0-9_.]/.test(after) || /^\s*\(/.test(after)) continue;
    const start = parseCell(m[3] as string);
    if (!start) continue;
    const end = m[4] ? parseCell(m[4]) : start;
    if (!end) continue;
    out.push({
      sheet: (m[1]?.replace(/''/g, "'") ?? m[2] ?? null) as string | null,
      start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
      end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) },
      text: m[0],
      index: m.index,
    });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase();

const cellAt = (sheet: Sheet | undefined, row: number, col: number) =>
  (sheet?.rows[row]?.[col] ?? "").trim();

const isBlankRange = (sheet: Sheet, r: Ref) => {
  for (let row = r.start.row; row <= Math.min(r.end.row, sheet.rows.length - 1); row += 1) {
    for (let col = r.start.col; col <= r.end.col; col += 1) {
      if (cellAt(sheet, row, col) !== "") return false;
    }
  }
  return true;
};

const rangeOutOfBounds = (sheet: Sheet, r: Ref) => {
  const height = sheet.rows.length;
  const width = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  return (
    r.start.row < 0 ||
    r.start.col < 0 ||
    r.start.row >= height ||
    r.end.row >= height ||
    r.start.col >= width ||
    r.end.col >= width
  );
};

const MATH_ONLY = /^=[-+]?[\s$A-Z0-9.!'":,()*/+%-]+$/i;
const SPILL_FUNC_RE = /^=\s*(FILTER|UNIQUE|SORT|SORTBY|SEQUENCE|TEXTSPLIT|TRANSPOSE)\s*\(/i;

/**
 * Read-only static checks. The legacy name is retained for callers.
 * No formula is rewritten. This is not a calculation engine.
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
        const formula = raw;

        // 1. repair references to sheets that do not exist
        const refs = collectRefs(formula);
        for (const r of refs) {
          if (!r.sheet) continue;
          if (byName.has(norm(r.sheet))) continue;
          issues.push({
            sheet: sheet.name,
            cell: A1(row, col),
            formula,
            kind: "missing-sheet",
            detail: `References missing sheet "${r.sheet}". Select the intended sheet explicitly.`,
          });
        }
        if (/\//.test(stripLiterals(formula)) && !/IFERROR|IFNA/i.test(formula))
          issues.push({
            sheet: sheet.name,
            cell: A1(row, col),
            formula,
            kind: "unguarded-division",
            detail:
              "Division may fail when the denominator is zero. Decide whether an error or fallback is appropriate.",
          });

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
            isArithmeticOperand(formula, r) &&
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

        // 4. dynamic-array formulas need clear room to spill into
        if (SPILL_FUNC_RE.test(formula)) {
          const below = cellAt(sheet, row + 1, col);
          if (below !== "") {
            issues.push({
              sheet: sheet.name,
              cell: A1(row, col),
              formula,
              kind: "spill-blocked",
              detail: `${A1(row + 1, col)} already holds "${below.slice(0, 24)}", may block this dynamic array if it returns more than one row. Confirm its spill size in Excel.`,
            });
          }
        }

        // Read-only auditing preserves the source formula.
      }
    }
  }

  const cycleIssues = detectCircularRefs(sheets, byName);
  return { sheets, fixes, issues: dedupe([...issues, ...cycleIssues]) };
}

/** Build a dependency graph over single-cell formula references and report reference cycles. */
function detectCircularRefs(sheets: Sheet[], byName: Map<string, Sheet>): AuditIssue[] {
  type Node = { sheet: string; cell: string; formula: string };
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Set<string>>();
  const formulaRows = new Map<string, Map<number, number[]>>();
  for (const sheet of sheets) {
    const rows = new Map<number, number[]>();
    sheet.rows.forEach((line, row) => {
      const cols = line.flatMap((value, col) => (value.trimStart().startsWith("=") ? [col] : []));
      if (cols.length) rows.set(row, cols);
    });
    formulaRows.set(sheet.name, rows);
  }
  let checks = 0;
  const limitIssues: AuditIssue[] = [];
  let limited = false;

  for (const sheet of sheets) {
    for (let row = 0; row < sheet.rows.length; row += 1) {
      const line = sheet.rows[row] as string[];
      for (let col = 0; col < line.length; col += 1) {
        const formula = (line[col] ?? "").trim();
        if (!formula.startsWith("=")) continue;
        const key = `${sheet.name}!${A1(row, col)}`;
        nodes.set(key, { sheet: sheet.name, cell: A1(row, col), formula });
        const deps = new Set<string>();
        for (const r of collectRefs(formula)) {
          const targetSheetName = r.sheet ? (byName.get(norm(r.sheet))?.name ?? null) : sheet.name;
          if (!targetSheetName) continue;
          if (r.start.row !== r.end.row || r.start.col !== r.end.col) {
            if (
              targetSheetName === sheet.name &&
              row >= r.start.row &&
              row <= r.end.row &&
              col >= r.start.col &&
              col <= r.end.col
            )
              deps.add(key);
            if (!limited) {
              scan: for (const [targetRow, columns] of formulaRows.get(targetSheetName) ?? []) {
                if (++checks > 1000000) {
                  limited = true;
                  break;
                }
                if (targetRow < r.start.row || targetRow > r.end.row) continue;
                for (const targetCol of columns) {
                  if (++checks > 1000000) {
                    limited = true;
                    break scan;
                  }
                  if (targetCol >= r.start.col && targetCol <= r.end.col)
                    deps.add(`${targetSheetName}!${A1(targetRow, targetCol)}`);
                }
              }
              if (limited)
                limitIssues.push({
                  sheet: sheet.name,
                  cell: A1(row, col),
                  formula,
                  kind: "audit-limit",
                  detail:
                    "Dependency audit reached its work limit. Some range cycles were not checked; validate this workbook in Excel.",
                });
            }
            continue;
          }
          deps.add(`${targetSheetName}!${A1(r.start.row, r.start.col)}`);
        }
        edges.set(key, deps);
      }
    }
  }

  const state = new Map<string, 0 | 1 | 2>(); // 0 = unvisited, 1 = on the current path, 2 = fully explored
  const issues: AuditIssue[] = [];
  const stack: string[] = [];

  for (const start of nodes.keys()) {
    if (state.get(start)) continue;
    const frames: { key: string; deps: string[]; index: number }[] = [];
    const enter = (key: string) => {
      state.set(key, 1);
      stack.push(key);
      frames.push({ key, deps: [...(edges.get(key) ?? [])], index: 0 });
    };
    enter(start);
    while (frames.length) {
      const frame = frames[frames.length - 1]!;
      const dep = frame.deps[frame.index++];
      if (dep === undefined) {
        state.set(frame.key, 2);
        stack.pop();
        frames.pop();
        continue;
      }
      if (!nodes.has(dep)) continue;
      if (state.get(dep) === 1) {
        const node = nodes.get(frame.key)!;
        const chain = [...stack.slice(Math.max(stack.indexOf(dep), stack.length - 10)), dep].join(
          " -> ",
        );
        issues.push({
          sheet: node.sheet,
          cell: node.cell,
          formula: node.formula,
          kind: "circular-ref",
          detail: `Circular reference: ${chain}`,
        });
      } else if (!state.get(dep)) enter(dep);
    }
  }

  return [...issues, ...limitIssues];
}

/** True when the ref is a direct operand of + - * / ^ (not a comparison or text argument). */
function isArithmeticOperand(formula: string, r: Ref) {
  const s = stripLiterals(formula);
  const before = s.slice(0, r.index).replace(/\s+$/, "");
  const after = s.slice(r.index + r.text.length).replace(/^\s+/, "");
  const opBefore = /[-+*/^]$/.test(before) && !/[=<>]$/.test(before);
  const opAfter = /^[-+*/^]/.test(after) && !/^[-+*/^]?=/.test(after);
  return opBefore || opAfter;
}

function isTextCell(value: string) {
  if (!value || value.startsWith("=")) return false;
  if (/^-?\(?\$?-?[\d,]+(\.\d+)?\)?%?$/.test(value)) return false;
  // dates and date-times behave as numbers in Excel maths
  if (/^\d{4}-\d{1,2}-\d{1,2}([ T].*)?$/.test(value)) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value)) return false;
  if (/^-?\$?[\d,]+(\.\d+)?\s*(x|bps)$/i.test(value)) return false;
  return true;
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
