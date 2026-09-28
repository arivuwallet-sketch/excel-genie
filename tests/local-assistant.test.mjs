import { test } from "node:test";
import assert from "node:assert/strict";
import { runLocalAssistant } from "../src/lib/local-assistant.ts";
const sheets = [
  {
    name: "Sales",
    rows: [
      ["Category", "Amount", "ID"],
      ["A", "10", "001"],
      ["B", "5", "002"],
      ["A", "20", "003"],
      ["B", "", "004"],
    ],
  },
];
const request = (prompt, overrides = {}) => ({
  prompt,
  sheets,
  history: [],
  mode: "edit",
  activeSheet: "Sales",
  ...overrides,
});

test("full-data local summaries are accurate and preserve identifiers and source workbook", () => {
  const original = structuredClone(sheets);
  const result = runLocalAssistant(request("Summarize this sheet"));
  assert.match(result.reply, /4 nonblank data rows/);
  assert.match(result.reply, /Amount \(B2:B5\) \| 1 \| 3 \| 35 \|/);
  assert.match(result.reply, /ID \(C2:C5\) \| 0 \| 0 \| —/);
  assert.equal(result.sheets, sheets);
  assert.deepEqual(sheets, original);
  assert.equal(result.model, "Local tools · deterministic");
});
test("local summaries scan rows beyond model samples and exclude formula results", () => {
  const input = [
    {
      name: "Rows",
      rows: [["Amount"], ...Array.from({ length: 999 }, () => ["1"]), ["999"], ["=SUM(A2:A1000)"]],
    },
  ];
  const result = runLocalAssistant(request("Profile this sheet", { sheets: input }));
  assert.match(result.reply, /1001 nonblank data rows/);
  assert.match(result.reply, /1000 \| 1998 \|/);
  assert.match(result.reply, /1 formula cells are excluded/);
});
test("grouped sum, average and row counts use full data and unique output names", () => {
  for (const [prompt, expected] of [
    [
      'Sum "Amount" by "Category"',
      [
        ["A", "30"],
        ["B", "5"],
      ],
    ],
    [
      'Average "Amount" by "Category"',
      [
        ["A", "15"],
        ["B", "5"],
      ],
    ],
    [
      'Count rows by "Category"',
      [
        ["A", "2"],
        ["B", "2"],
      ],
    ],
  ]) {
    const result = runLocalAssistant(request(prompt));
    assert.deepEqual(result.sheets[1].rows.slice(1), expected);
    assert.equal(result.sheets[0], sheets[0]);
    const repeated = runLocalAssistant(request(prompt, { sheets: result.sheets }));
    assert.notEqual(repeated.sheets[2].name, repeated.sheets[1].name);
  }
});
test("Ask returns grouped answers without mutating sheets", () => {
  const answer = runLocalAssistant(request('Sum "Amount" by "Category"', { mode: "ask" }));
  assert.equal(answer.sheets, sheets);
  assert.match(answer.reply, /A \| 30/);
  assert.equal(runLocalAssistant(request("Trim whitespace", { mode: "ask" })).sheets, sheets);
});
test("ambiguous headers and unevaluated grouping/value columns are rejected", () => {
  for (const rows of [
    [
      ["Amount", "Amount", "Category"],
      ["1", "2", "A"],
    ],
    [
      ["Amount", "Category"],
      ["=1+1", "A"],
    ],
    [
      ["Amount", "Category"],
      ["2", "=A1"],
    ],
  ]) {
    const input = [{ name: "Data", rows }];
    assert.equal(
      runLocalAssistant(request('Sum "Amount" by "Category"', { sheets: input })).sheets,
      input,
    );
  }
});
test("cleaning never activates formula-like text or shifts formula references", () => {
  const input = [
    {
      name: "Data",
      rows: [["Label"], ["  x "], [' =WEBSERVICE("https://invalid")'], ["=1+1"], [""]],
    },
  ];
  const trimmed = runLocalAssistant(request("Trim whitespace", { sheets: input }));
  assert.equal(trimmed.sheets[0].rows[1][0], "x");
  assert.equal(trimmed.sheets[0].rows[2][0], input[0].rows[2][0]);
  assert.equal(runLocalAssistant(request("Remove blank rows", { sheets: input })).sheets, input);
});
test("deduplication preserves headers and proposes a separate immutable workbook", () => {
  const input = [{ name: "Data", rows: [["Name"], ["A"], ["A"], ["B"]] }];
  const result = runLocalAssistant(request("Remove duplicate rows", { sheets: input }));
  assert.deepEqual(result.sheets[0].rows, [["Name"], ["A"], ["B"]]);
  assert.equal(input[0].rows.length, 4);
});
test("unknown and compound commands do not partially apply edits", () => {
  for (const prompt of [
    "Trim whitespace and delete Sheet2",
    "Remove duplicate rows except the first 10",
    "Do not remove duplicate rows",
    "Create a budget workbook",
  ]) {
    const result = runLocalAssistant(request(prompt));
    assert.equal(result.sheets, sheets);
    assert.match(result.reply, /guided workflow or an AI model/);
  }
});
test("formula audit explains static checks and returns evidence without repairs", () => {
  const input = [{ name: "Data", rows: [["=Missing!A1"]] }];
  const result = runLocalAssistant(
    request("Audit my formulas and list broken references", { sheets: input }),
  );
  assert.ok(result.issues.some((i) => i.kind === "missing-sheet"));
  assert.equal(result.sheets, input);
  assert.deepEqual(result.fixes, []);
});

test("numeric overflow cannot become a misleading grouped result", () => {
  const enormous = "1" + "0".repeat(308) + ".0";
  const input = [
    {
      name: "Data",
      rows: [
        ["Group", "Amount"],
        ["A", enormous],
        ["A", enormous],
      ],
    },
  ];
  assert.throws(
    () => runLocalAssistant(request('Sum "Amount" by "Group"', { sheets: input })),
    /numeric range/,
  );
});
