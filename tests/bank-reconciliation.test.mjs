import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TEMPLATES } from "../src/lib/templates/index.ts";
import { calculateWorkbook } from "../src/lib/calculation.ts";
import { buildStyledWorkbook } from "../src/lib/excel-export.ts";

const template = ALL_TEMPLATES.find((t) => t.id === "bank-reconciliation");
const cell = (calc, sheet, ref) => {
  const s = calc.sheets.find((x) => x.name === sheet);
  const col = ref.charCodeAt(0) - 65;
  return s.rows[Number(ref.slice(1)) - 1][col];
};

test("bank reconciliation reconciles to the cent and passes every control check", () => {
  const calc = calculateWorkbook(template.build());
  assert.equal(cell(calc, "Reconciliation", "B11"), "187783.29");
  assert.equal(cell(calc, "Reconciliation", "B21"), "187783.29");
  assert.equal(cell(calc, "Reconciliation", "B24"), "RECONCILED");
  assert.equal(cell(calc, "Checks", "B17"), "TRUE");
});

test("bank reconciliation catches a mis-keyed amount and a broken statement total", () => {
  const sheets = template.build();
  const book = sheets.find((s) => s.name === "Cash Book");
  const row = book.rows.find((r) => r[1] === "ACH-55117");
  row[3] = "27981.6"; // transposed receipt
  const setup = sheets.find((s) => s.name === "Setup");
  setup.rows[10][1] = "185000"; // printed statement balance no longer ties
  const calc = calculateWorkbook(sheets);
  const bankRow = calc.sheets
    .find((s) => s.name === "Bank Statement")
    .rows.find((r) => r[1] === "ACH-55117");
  assert.equal(bankRow[7], "Amount mismatch");
  assert.equal(cell(calc, "Checks", "B4"), "FALSE");
  assert.equal(cell(calc, "Checks", "B17"), "FALSE");
});

test("ISO dates work in arithmetic and export as real Excel dates", async () => {
  const sheets = [
    {
      name: "D",
      rows: [
        ["2026-03-31", "2026-03-02", "=A1-B1", "=B1"],
        ["Fee ($)", "12.34", "", ""],
        ["x", "1.5", "2.25", "3.75"],
      ],
    },
  ];
  assert.equal(calculateWorkbook(sheets).sheets[0].rows[0][2], "29");
  const ws = (await buildStyledWorkbook(sheets)).getWorksheet("D");
  assert.ok(ws.getCell("A1").value instanceof Date);
  assert.equal(ws.getCell("A1").numFmt, "yyyy-mm-dd");
  assert.equal(ws.getCell("D1").numFmt, "yyyy-mm-dd");
});
