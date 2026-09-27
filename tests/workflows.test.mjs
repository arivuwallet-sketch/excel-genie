import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileSheets,
  joinSheets,
  consolidateSheets,
  splitColumn,
  findReplace,
  stressSheet,
  syntheticTransactions,
} from "../src/lib/workflows.ts";
import { combineImports } from "../src/lib/import-batch.ts";
const left = {
  name: "Ledger",
  rows: [
    ["ID", "Amount"],
    [" A ", "100"],
    ["B", "50"],
    ["C", "20"],
    ["D", "5"],
    ["D", "7"],
  ],
};
const right = {
  name: "Bank",
  rows: [
    ["ID", "Amount"],
    ["a", "100.005"],
    ["B", "40"],
    ["E", "20"],
    ["D", "12"],
  ],
};
const options = { leftKey: 0, rightKey: 0, leftAmount: 1, rightAmount: 1, tolerance: 0.01 };
test("reconciliation matches tolerance and flags variance, missing and ambiguous records", () => {
  const before = structuredClone([left, right]);
  const out = reconcileSheets(left, right, options);
  assert.deepEqual(
    out.rows.slice(1).map((r) => r[0]),
    ["Matched", "Variance", "Left only", "Ambiguous", "Ambiguous", "Right only"],
  );
  assert.equal(out.rows[2][6], "10");
  assert.deepEqual([left, right], before);
});
test("invalid amounts are never coerced to zero; keys preserve leading zeros", () => {
  const out = reconcileSheets(
    {
      name: "L",
      rows: [
        ["ID", "Amount"],
        ["001", "bad"],
        ["", "10"],
      ],
    },
    {
      name: "R",
      rows: [
        ["ID", "Amount"],
        ["001", "0"],
        ["1", "2"],
      ],
    },
    options,
  );
  assert.deepEqual(
    out.rows.slice(1).map((r) => r[0]),
    ["Invalid amount", "Missing key", "Right only"],
  );
});
test("lookup joins retain left rows and reject ambiguous right keys", () => {
  const out = joinSheets(left, right, 0, 0);
  assert.equal(out.rows.length, left.rows.length);
  assert.equal(out.rows[1].at(-1), "Matched");
  assert.equal(out.rows[3].at(-1), "Unmatched");
  assert.throws(() => joinSheets(right, left, 0, 0), /Duplicate lookup key/);
});
test("consolidation aligns reordered headings and retains source rows", () => {
  const out = consolidateSheets([
    {
      name: "A",
      rows: [
        ["ID", "Amount"],
        ["X", "2"],
      ],
    },
    {
      name: "B",
      rows: [
        ["amount", "ID", "Extra"],
        ["3", "Y", "yes"],
      ],
    },
  ]);
  assert.deepEqual(out.rows[2], ["B", "2", "Y", "3", "yes"]);
  assert.throws(
    () => consolidateSheets([left, { name: "Bad", rows: [["ID", "id"]] }]),
    /duplicate column/,
  );
});
test("split and stress pad ragged rows and keep original columns", () => {
  const input = { name: "Data", rows: [["Name", "Amount"], ["A,B", "10"], ["C"]] };
  assert.deepEqual(splitColumn(input, 0, ",").rows[2], ["C", "", "C", ""]);
  assert.deepEqual(stressSheet(input, 1, -10).rows[1], ["A,B", "10", "9", "-10%"]);
  assert.deepEqual(stressSheet(input, 1, -10).rows[2], ["C", "", "", "-10%"]);
});
test("literal replacement preserves formulas and does not expand replacement tokens", () => {
  assert.deepEqual(
    findReplace({ name: "Data", rows: [["a.b", "=a.b", " =a.b"]] }, ".", "$&").rows[0],
    ["a$&b", "=a.b", " =a.b"],
  );
});
test("formula inputs require calculation and synthetic rows are labelled reproducible data", () => {
  assert.throws(
    () =>
      reconcileSheets(
        {
          ...left,
          rows: [
            ["ID", "Amount"],
            ["A", "=1+1"],
          ],
        },
        right,
        options,
      ),
    /Values copy/,
  );
  assert.deepEqual(syntheticTransactions(5, 42), syntheticTransactions(5, 42));
  assert.equal(syntheticTransactions(5).rows.length, 6);
  assert.match(syntheticTransactions(5).rows[1].at(-1), /not real/);
  assert.throws(() => syntheticTransactions(10000), /9,999/);
});
test("multiple CSV sheets get unique names; formula-bearing conflicts fail safely", () => {
  const input = { name: "Sheet1", rows: [["ID"], ["A"]] };
  assert.deepEqual(
    combineImports([[input], [input]]).map((s) => s.name),
    ["Sheet1", "Sheet1 (2)"],
  );
  assert.throws(
    () => combineImports([[{ ...input, rows: [["=1+1"]] }]], [input]),
    /conflicting sheet name/,
  );
});
