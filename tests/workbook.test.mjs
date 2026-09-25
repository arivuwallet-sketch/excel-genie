import { test } from "node:test";
import assert from "node:assert/strict";
import {
  numericValue,
  profileSheet,
  cleanSheet,
  pivotSheet,
  workbookDiff,
  workbookContext,
} from "../src/lib/workbook-intelligence.ts";
import { validateWorkbook, parseCellAddress } from "../src/lib/workbook-limits.ts";
import { applyOperations } from "../src/lib/workbook-operations.ts";
import { auditAndRepair, collectRefs } from "../src/lib/formula-audit.ts";
import { parseWorkspace } from "../src/lib/workspace-storage.ts";
import { hasUnsafeFormula } from "../src/lib/formula-safety.ts";
const source = [
  {
    name: "Sales",
    rows: [
      ["Region", "Amount"],
      ["East", "100"],
      ["West", "200"],
      ["East", "50"],
      ["East", "50"],
      ["", ""],
    ],
  },
];
test("numeric parsing preserves identifiers and excludes formulas", () => {
  for (const v of ["", "0012", "=SUM(A1:A2)", "2026-09-24", "12abc", "1,23"])
    assert.equal(numericValue(v), null);
  assert.equal(numericValue("₹1,250.50"), 1250.5);
  assert.equal(numericValue("(200)"), -200);
  assert.equal(numericValue("12.5%"), 0.125);
});
test("profiles use all nonblank data rows and exclude header", () => {
  const p = profileSheet(source[0]);
  assert.equal(p.rows, 4);
  assert.equal(p.duplicates, 1);
  assert.equal(p.blankRows, 1);
  assert.equal(p.columns[1].sum, 400);
});
test("profiles never invent formula results", () => {
  const p = profileSheet({ name: "S", rows: [["n"], ["=1+1"], ["10"]] });
  assert.equal(p.columns[0].numeric, 1);
  assert.equal(p.columns[0].mean, 10);
  assert.equal(p.formulas, 1);
});
test("cleaning is immutable and preserves formulas", () => {
  const s = { name: "S", rows: [["h"], [" a "], ["= A1 "]] };
  assert.equal(cleanSheet(s, "trim").rows[1][0], "a");
  assert.equal(s.rows[1][0], " a ");
  assert.equal(cleanSheet(s, "trim").rows[2][0], "= A1 ");
});
test("deduplication compares full rows and retains header", () => {
  assert.equal(cleanSheet(source[0], "deduplicate").rows.length, 5);
  assert.equal(cleanSheet(source[0], "remove_blank_rows").rows.length, 5);
});
test("pivot aggregation is deterministic", () => {
  assert.deepEqual(pivotSheet(source[0], 0, 1, "sum").rows.slice(1), [
    ["East", "200"],
    ["West", "200"],
  ]);
  assert.equal(pivotSheet(source[0], 0, 1, "count").rows[1][1], "3");
  assert.equal(Number(pivotSheet(source[0], 0, 1, "average").rows[1][1]), 200 / 3);
});
test("pivot does not invent zero for unevaluated formulas", () => {
  assert.equal(
    pivotSheet(
      {
        name: "S",
        rows: [
          ["g", "v"],
          ["A", "=1+1"],
        ],
      },
      0,
      1,
      "sum",
    ).rows[1][1],
    "",
  );
});
test("diff reports removals and caps preview without losing total", () => {
  const d = workbookDiff(source, [{ name: "New", rows: [["x"]] }], 2);
  assert.deepEqual(d.removed, ["Sales"]);
  assert.deepEqual(d.added, ["New"]);
  assert.equal(d.changes.length, 2);
  assert.ok(d.total > 2);
});
test("context includes tail rows and discloses samples", () => {
  const c = workbookContext([
    { name: "Long", rows: Array.from({ length: 1000 }, (_, i) => [String(i)]) },
  ]);
  assert.match(c, /"row":1000/);
  assert.match(c, /Omitted rows exist/);
});
test("invalid and huge addresses are rejected", () => {
  for (const ref of ["A0", "A-1", "A10001", "XFD1000000", "IW1", "ABC", "A1:B2"])
    assert.equal(parseCellAddress(ref), null);
  assert.deepEqual(parseCellAddress("$IV$10000"), { row: 9999, col: 255 });
});
test("names and case-insensitive duplicates are validated", () => {
  assert.throws(() => validateWorkbook([{ name: "Bad/name", rows: [] }]));
  assert.throws(() =>
    validateWorkbook([
      { name: "S", rows: [] },
      { name: "s", rows: [] },
    ]),
  );
});
test("valid cell edits retain unrelated sheets and original input", () => {
  const cur = [...source, { name: "Other", rows: [["keep"]] }],
    old = structuredClone(cur);
  const r = applyOperations(cur, [
    { op: "set_cells", sheet: "Sales", cells: [{ a1: "B2", value: "500" }] },
  ]);
  assert.equal(r.problems.length, 0);
  assert.equal(r.sheets[0].rows[1][1], "500");
  assert.deepEqual(r.sheets[1], cur[1]);
  assert.deepEqual(cur, old);
});
test("a failed operation rolls back the entire batch", () => {
  const r = applyOperations(source, [
    { op: "set_cells", sheet: "Sales", cells: [{ a1: "B2", value: "500" }] },
    { op: "set_cells", sheet: "missing", cells: [{ a1: "A1", value: "bad" }] },
  ]);
  assert.deepEqual(r.sheets, source);
  assert.ok(r.problems.length);
});
test("A0 never partially applies edits", () => {
  const r = applyOperations(source, [
    { op: "set_cells", sheet: "Sales", cells: [{ a1: "A0", value: "bad" }] },
  ]);
  assert.deepEqual(r.sheets, source);
  assert.ok(r.problems.length);
});
test("range overflow is rejected before padding", () => {
  assert.ok(
    applyOperations(source, [
      { op: "set_range", sheet: "Sales", startCell: "IV10000", values: [["a", "b"]] },
    ]).problems.length,
  );
});
test("cannot delete final sheet", () => {
  assert.deepEqual(applyOperations(source, [{ op: "delete_sheet", name: "Sales" }]).sheets, source);
});
test("rename cannot collide with another sheet", () => {
  const cur = [...source, { name: "Other", rows: [["keep"]] }];
  assert.deepEqual(
    applyOperations(cur, [{ op: "rename_sheet", from: "Sales", to: "other" }]).sheets,
    cur,
  );
});
test("structural edits cannot silently break formulas", () => {
  assert.ok(
    applyOperations(
      [{ name: "S", rows: [["1"], ["=A1"]] }],
      [{ op: "delete_rows", sheet: "S", atRow: 1, count: 1 }],
    ).problems.length,
  );
});
test("auditing never guesses sheet names or rewrites source", () => {
  const s = [{ name: "Sales", rows: [["=Sale!A1/0"]] }],
    r = auditAndRepair(s);
  assert.deepEqual(r.sheets, s);
  assert.equal(r.fixes.length, 0);
  assert.ok(r.issues.some((i) => i.kind === "missing-sheet"));
});
test("punctuation in sheet names is meaningful", () => {
  assert.ok(
    auditAndRepair([
      { name: "AB", rows: [["1"]] },
      { name: "S", rows: [["='A-B'!A1"]] },
    ]).issues.some((i) => i.kind === "missing-sheet"),
  );
});
test("apostrophes in worksheet references are decoded", () => {
  assert.equal(collectRefs("='Owner''s Sales'!B2")[0].sheet, "Owner's Sales");
});
test("backup recovery validates schema and preserves cells and chat", () => {
  const b = {
    version: 1,
    sheets: source,
    messages: [{ role: "assistant", content: "Hello" }],
    fileName: "test.xlsx",
    savedAt: "now",
  };
  assert.deepEqual(parseWorkspace(JSON.stringify(b)), b);
  assert.throws(() => parseWorkspace('{"version":2}'));
});
test("normal cross-sheet formulas work but external formulas are blocked", () => {
  assert.equal(
    hasUnsafeFormula([{ op: "create_sheet", name: "Summary", rows: [["='Sales'!A1"]] }]),
    false,
  );
  for (const f of ['=WEBSERVICE("https://example.com")', "='[other.xlsx]S'!A1", "=cmd|x!A1"])
    assert.equal(hasUnsafeFormula({ rows: [[f]] }), true);
});
test("totals including their own cell are flagged", () => {
  assert.ok(
    auditAndRepair([{ name: "S", rows: [["1"], ["=SUM(A1:A2)"]] }]).issues.some(
      (i) => i.kind === "circular-ref",
    ),
  );
});
test("10,000-cell dependency chains do not overflow stack", () => {
  const rows = Array.from({ length: 10000 }, (_, i) => [i === 9999 ? "1" : `=A${i + 2}`]);
  assert.equal(auditAndRepair([{ name: "S", rows }]).issues.length, 0);
});

test("large column headers cannot overflow the AI context budget", () => {
  const sheets = Array.from({ length: 30 }, (_, i) => ({
    name: `S${i}`,
    rows: [Array(20).fill("x".repeat(10000)), Array(20).fill("1")],
  }));
  assert.ok(workbookContext(sheets).length <= 60000);
});

test("large numeric identifiers retain all digits", () => {
  assert.equal(numericValue("12345678901234567890"), null);
  assert.equal(numericValue("123456789012345"), 123456789012345);
});
test("audit reads lowercase and reversed references without mistaking function names for cells", () => {
  const refs = collectRefs("=LOG10(a1)+SUM(b3:b1)+A1_total");
  assert.deepEqual(
    refs.map((r) => r.text),
    ["a1", "b3:b1"],
  );
  assert.deepEqual(refs[1].start, { row: 0, col: 1 });
  assert.deepEqual(refs[1].end, { row: 2, col: 1 });
});
test("audit detects cross-sheet cycles through ranges", () => {
  const sheets = [
    { name: "A", rows: [["=SUM(B!A1:A2)"]] },
    { name: "B", rows: [["=A!A1"], ["1"]] },
  ];
  assert.ok(auditAndRepair(sheets).issues.some((i) => i.kind === "circular-ref"));
});
test("audit sees data beyond row 5001 in a range", () => {
  const rows = Array.from({ length: 6000 }, () => [""]);
  rows[5999] = ["1"];
  const result = auditAndRepair([
    { name: "Data", rows },
    { name: "Summary", rows: [["=SUM(Data!A1:A6000)"]] },
  ]);
  assert.equal(
    result.issues.some((i) => i.kind === "empty-ref"),
    false,
  );
});
test("range dependency budget is explicit rather than freezing the UI", () => {
  const rows = Array.from({ length: 1200 }, (_, i) => [`=SUM(B1:B1200)`, i === 0 ? "1" : "=1+1"]);
  assert.ok(auditAndRepair([{ name: "S", rows }]).issues.some((i) => i.kind === "audit-limit"));
});
test("deleting a referenced sheet rolls back the whole operation batch", () => {
  const sheets = [
    { name: "Source", rows: [["1"]] },
    { name: "Summary", rows: [["='Source'!a1"]] },
  ];
  const result = applyOperations(sheets, [
    { op: "set_cells", sheet: "Source", cells: [{ a1: "A1", value: "2" }] },
    { op: "delete_sheet", name: "Source" },
  ]);
  assert.deepEqual(result.sheets, sheets);
  assert.match(result.problems[0], /depend/);
});
test("unreferenced sheets can be deleted without affecting formulas", () => {
  const sheets = [
    { name: "Source", rows: [["=1+1"]] },
    { name: "Unused", rows: [["x"]] },
  ];
  const result = applyOperations(sheets, [{ op: "delete_sheet", name: "Unused" }]);
  assert.equal(result.problems.length, 0);
  assert.equal(result.sheets.length, 1);
});
import { formulaCompatibility } from "../src/lib/formula-compatibility.ts";
test("modern and connected formula requirements are reported without claiming execution", () => {
  const result = formulaCompatibility([
    {
      name: "S",
      rows: [
        [
          "=GROUPBY(A1:A2,B1:B2,SUM)",
          '=PY("x")',
          "=GPT(A1)",
          '=REGEXEXTRACT(A1,"x")',
          '="COPILOT(A1)"',
        ],
      ],
    },
  ]);
  assert.deepEqual(result.modern, ["GROUPBY", "REGEXEXTRACT"]);
  assert.deepEqual(result.connected, ["GPT", "PY"]);
});

import {
  findAssumptions,
  findModelControl,
  updateModelControl,
} from "../src/lib/model-controls.ts";
test("assumption controls show fractions as percentages without mislabelling prices", () => {
  const values = findAssumptions([
    {
      name: "Drivers",
      rows: [
        ["Growth", "0.1"],
        ["Tax rate", "25%"],
        ["Unit price", "0.5"],
        ["Interest rate", "-0.02"],
      ],
    },
  ]);
  assert.deepEqual(
    values.map((a) => [a.value, a.isPercent]),
    [
      [10, true],
      [25, true],
      [0.5, false],
      [-2, true],
    ],
  );
});
test("scenario controls update numeric and named driver cells without replacing formulas", () => {
  const sheets = [
    {
      name: "S",
      rows: [
        ["Active scenario (1 = Base, 2 = Best, 3 = Bear)", "1"],
        ["Active scenario name", '=CHOOSE(B1,"Base","Best","Bear")'],
      ],
    },
  ];
  const next = updateModelControl(sheets, "scenario", "Upside");
  assert.equal(next[0].rows[0][1], "2");
  assert.equal(next[0].rows[1][1], sheets[0].rows[1][1]);
  assert.equal(findModelControl(next, "scenario").value, "Upside");
  assert.equal(sheets[0].rows[0][1], "1");
  const named = [{ name: "S", rows: [["Selected case", "Base"]] }];
  assert.equal(updateModelControl(named, "scenario", "Downside")[0].rows[0][1], "Downside");
});
test("depreciation controls only apply supported methods to the dedicated driver", () => {
  const sheets = [
    {
      name: "S",
      rows: [
        ["Payment method", "Cash"],
        ["Depreciation method (Straight-Line / Double Declining / MACRS)", "Straight-Line"],
      ],
    },
  ];
  const next = updateModelControl(sheets, "depreciation", "MACRS");
  assert.equal(next[0].rows[0][1], "Cash");
  assert.equal(next[0].rows[1][1], "MACRS");
  assert.equal(updateModelControl(sheets, "depreciation", "arbitrary"), sheets);
  assert.equal(findModelControl(source, "scenario"), null);
});
