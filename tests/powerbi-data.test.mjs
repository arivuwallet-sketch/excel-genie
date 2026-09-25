import { test } from "node:test";
import assert from "node:assert/strict";
import { toPbiTables, assertPbiSchema } from "../src/lib/powerbi-data.ts";

test("Power BI retains first data row and parses percentages, currencies and negatives", () => {
  const [table] = toPbiTables([
    {
      name: "Sales",
      rows: [
        ["Rate", "Amount"],
        ["12.5%", "₹1,250.50"],
        ["", "(200)"],
      ],
    },
  ]);
  assert.deepEqual(table.rows, [
    { Rate: 0.125, Amount: 1250.5 },
    { Rate: null, Amount: -200 },
  ]);
});
test("Power BI preserves mixed columns and identifiers instead of replacing text with zero", () => {
  const [table] = toPbiTables([
    {
      name: "S",
      rows: [
        ["Amount", "ID"],
        ["100", "00123"],
        ["pending", "00124"],
      ],
    },
  ]);
  assert.deepEqual(
    table.columns.map((c) => c.dataType),
    ["String", "String"],
  );
  assert.equal(table.rows[1].Amount, "pending");
  assert.equal(table.rows[0].ID, "00123");
});
test("Power BI refuses unevaluated formulas before network writes", () => {
  assert.throws(() => toPbiTables([{ name: "S", rows: [["Amount"], [" =1+1"]] }]), /values-only/);
});
test("Power BI names remain unique and preserve all duplicate-header values", () => {
  const tables = toPbiTables([
    {
      name: "A.B",
      rows: [
        ["Value", "value", ""],
        ["one", "two", "three"],
      ],
    },
    { name: "A B", rows: [["H"], ["x"]] },
  ]);
  assert.deepEqual(
    tables.map((t) => t.sanitized),
    ["A B", "A B 2"],
  );
  assert.deepEqual(tables[0].rows[0], { Value: "one", "value 2": "two", "Column 3": "three" });
});
test("Power BI rejects schema changes before clearing rows", () => {
  const tables = toPbiTables([{ name: "S", rows: [["Amount"], ["100"]] }]);
  assert.doesNotThrow(() =>
    assertPbiSchema(tables, [{ name: "S", columns: [{ name: "Amount", dataType: "Double" }] }]),
  );
  for (const schema of [
    [],
    [{ name: "S", columns: [{ name: "Amount", dataType: "String" }] }],
    [{ name: "Old", columns: tables[0].columns }],
  ])
    assert.throws(() => assertPbiSchema(tables, schema), /no existing rows/);
});
