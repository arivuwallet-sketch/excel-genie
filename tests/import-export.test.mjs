import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import * as spreadsheet from "../src/lib/spreadsheet.ts";
import { buildStyledWorkbook } from "../src/lib/excel-export.ts";
test("import preserves formulas without cached values and A1 offsets", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    {
      "!ref": "B3:C4",
      B3: { t: "s", v: "Amount" },
      C3: { t: "s", v: "Total" },
      B4: { t: "n", v: 42 },
      C4: { t: "n", f: "B4*2" },
    },
    "Data",
  );
  const s = spreadsheet.workbookToSheets(wb);
  assert.equal(s[0].rows[3][1], "42");
  assert.equal(s[0].rows[3][2], "=B4*2");
  assert.equal(s[0].rows[2][1], "Amount");
});
test("export retains numeric types, text identifiers and formulas", () => {
  const wb = spreadsheet.sheetsToWorkbook([
    {
      name: "S",
      rows: [
        ["Value", "ID", "Formula"],
        ["42", "0012", "=A2*2"],
      ],
    },
  ]);
  assert.equal(wb.Sheets.S.A2.t, "n");
  assert.equal(wb.Sheets.S.B2.v, "0012");
  assert.equal(wb.Sheets.S.C2.f, "A2*2");
});
test("styled export preserves identifiers and enables recalculation", async () => {
  const wb = await buildStyledWorkbook([{ name: "S", rows: [["ID"], ["00123"], ["=1+1"]] }]);
  assert.equal(wb.getWorksheet("S").getCell("A2").value, "00123");
  assert.equal(wb.calcProperties.fullCalcOnLoad, true);
});
test("single-column CSV parsing preserves all rows", () => {
  assert.deepEqual(spreadsheet.parseDelimited("Name\nAlice\nBob"), [["Name"], ["Alice"], ["Bob"]]);
});

test("numeric imports retain underlying precision instead of rounded displayed text", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    {
      "!ref": "A1:C1",
      A1: { t: "n", v: 1234.56789, w: "1,234.57", z: "#,##0.00" },
      B1: { t: "n", v: 0.123456, w: "12.3%", z: "0.0%" },
      C1: { t: "n", v: 123, w: "00123", z: "00000" },
    },
    "Data",
  );
  assert.deepEqual(spreadsheet.workbookToSheets(wb)[0].rows[0], [
    "1234.56789",
    "0.123456",
    "00123",
  ]);
});
test("empty sheets remain present for formula references", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, {}, "Empty");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["=Empty!A1"]]), "Summary");
  assert.deepEqual(
    spreadsheet.workbookToSheets(wb).map((s) => s.name),
    ["Empty", "Summary"],
  );
});
test("pasted tabular data preserves blank rows and trailing empty cells", () => {
  assert.deepEqual(spreadsheet.parseDelimited("a\tb\n\t\nc\t\n"), [
    ["a", "b"],
    ["", ""],
    ["c", ""],
  ]);
});
test("CSV filenames become valid worksheet names", async () => {
  const sheets = await spreadsheet.parseFile(new File(["a,b\n1,2"], "bad[name].csv"));
  assert.equal(sheets[0].name, "bad name");
});
test("sanitized names remain valid after truncation and are case-insensitively unique", () => {
  const used = new Set();
  assert.equal(spreadsheet.sanitizeSheetName("  'Name'  ", used), "Name");
  assert.equal(spreadsheet.sanitizeSheetName("name", used), "name 2");
  assert.equal(spreadsheet.sanitizeSheetName("a".repeat(30) + "'tail", used), "a".repeat(30));
});
test("XLSX serialization round trip retains formulas and long identifiers", async () => {
  const source = [
    {
      name: "S",
      rows: [
        ["ID", "Amount", "Total"],
        ["12345678901234567890", "12.3456789", "=B2*2"],
      ],
    },
  ];
  const styled = await buildStyledWorkbook(source);
  const buffer = await styled.xlsx.writeBuffer();
  const imported = await spreadsheet.parseFile(new File([buffer], "roundtrip.xlsx"));
  assert.deepEqual(imported, source);
});

test("CSV with quoted tabs retains comma-separated columns", () => {
  assert.deepEqual(spreadsheet.parseDelimited('Name,Note\nAlice,"a\tb"\nBob,"c\td"'), [
    ["Name", "Note"],
    ["Alice", "a\tb"],
    ["Bob", "c\td"],
  ]);
});
