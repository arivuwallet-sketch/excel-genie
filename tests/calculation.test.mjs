import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateWorkbook } from "../src/lib/calculation.ts";
import { OPERATIONS_TEMPLATES } from "../src/lib/templates/operations.ts";
test("supported functions, blanks, exact lookups, criteria and text have known results", () => {
  const cases = [
    ["SUM(A1:A3)", "60"],
    ["AVERAGE(A1:A3)", "20"],
    ["MIN(A1:A3)", "10"],
    ["MAX(A1:A3)", "30"],
    ["COUNT(A1:C3)", "3"],
    ["COUNTA(A1:C3)", "6"],
    ["COUNTBLANK(C1:C3)", "3"],
    ["IF(FALSE,1/0,7)", "7"],
    ["IFERROR(1e308*1e308,9)", "9"],
    ["AND(TRUE,FALSE)", "FALSE"],
    ["OR(FALSE,TRUE)", "TRUE"],
    ["NOT(FALSE)", "TRUE"],
    ['SUMIF(B1:B3,"alpha",A1:A3)', "40"],
    ['COUNTIF(B1:B3,"a*")', "2"],
    ['SUMIFS(A1:A3,B1:B3,"a*",A1:A3,">15")', "30"],
    ['COUNTIFS(B1:B3,"a*",A1:A3,">15")', "1"],
    ["VLOOKUP(20,A1:B3,2,FALSE)", "Beta"],
    ["INDEX(A1:B3,2,2)", "Beta"],
    ["INDEX(A1:C1,2)", "Alpha"],
    ["MATCH(20,A1:A3,0)", "2"],
    ['MATCH("a*",B1:B3,0)', "1"],
    ["ROUND(-1.25,1)", "-1.3"],
    ["ROUNDUP(-1.21,1)", "-1.3"],
    ["ROUNDDOWN(-1.29,1)", "-1.2"],
    ["ABS(-3)", "3"],
    ["INT(-1.2)", "-2"],
    ['LEN("Test")', "4"],
    ['LEFT("Test",2)', "Te"],
    ['RIGHT("Test",2)', "st"],
    ['MID("Testing",2,3)', "est"],
    ['TRIM(" a  b ")', "a b"],
    ['UPPER("test")', "TEST"],
    ['LOWER("TEST")', "test"],
    ['CONCATENATE("a",1)', "a1"],
    ["ISNUMBER(A1)", "TRUE"],
    ["ISTEXT(B1)", "TRUE"],
    ["ISBLANK(C1)", "TRUE"],
    ["SUM(A1,C1)", "10"],
    ['A1&" items"', "10 items"],
    ["2^3^2", "64"],
    ["-2^2", "4"],
  ];
  const result = calculateWorkbook([
    {
      name: "Data",
      rows: [
        ["10", "Alpha", ""],
        ["20", "Beta", ""],
        ["30", "alpha", ""],
        cases.map(([formula]) => `=${formula}`),
      ],
    },
  ]);
  assert.deepEqual(result.issues, []);
  cases.forEach(([formula, expected], i) =>
    assert.equal(result.sheets[0].rows[3][i], expected, formula),
  );
});
test("quoted sheets, absolute refs, leading zero identifiers and lazy branches remain distinct", () => {
  const result = calculateWorkbook([
    { name: "O'Brien", rows: [["001", "5"]] },
    {
      name: "Output",
      rows: [["='O''Brien'!$B$1+2", "=IF(TRUE,1,A1)", "=SUM('O''Brien'!A1:B1)", "='O''Brien'!A1"]],
    },
  ]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.sheets[1].rows[0], ["7", "1", "5", "001"]);
});
test("missing sheets, cycles, unimplemented functions and oversized ranges cannot become successful values", () => {
  const result = calculateWorkbook(
    [
      {
        name: "Data",
        rows: [["=IFERROR(XLOOKUP(1,A2:A3,B2:B3),0)", "=SUM(A1:A10000)"], ["=A3"], ["=A2"]],
      },
    ],
    100,
  );
  assert.deepEqual(result.sheets[0].rows, [["#UNSUPPORTED!", "#LIMIT!"], ["#CYCLE!"], ["#CYCLE!"]]);
});
test("dependent formulas, cross-sheet references, percentages and lookups calculate", () => {
  const sheets = [
    {
      name: "Inputs",
      rows: [
        ["Item", "Value"],
        ["A", "100"],
        ["B", "20%"],
      ],
    },
    {
      name: "Output",
      rows: [
        [
          "=Inputs!B2*(1+Inputs!B3)",
          "=SUM(Inputs!B2:B3)",
          "=IFERROR(1/0,99)",
          '=VLOOKUP("A",Inputs!A2:B3,2,FALSE)',
        ],
        ["=A1+10", '=COUNTIF(Inputs!A2:A3,"A")'],
      ],
    },
  ];
  const before = structuredClone(sheets),
    out = calculateWorkbook(sheets);
  assert.deepEqual(out.issues, []);
  assert.deepEqual(out.sheets[1].rows, [
    ["120", "100.2", "99", "100"],
    ["130", "1"],
  ]);
  assert.deepEqual(sheets, before);
});
test("errors and unsupported functions remain explicit, references propagate errors", () => {
  const out = calculateWorkbook([
    {
      name: "Data",
      rows: [
        ["=1/0", "=A1+2", "=Unknown!A1", "=SUM(A2:A3)"],
        ["=A3"],
        ["=A2"],
        ['=WEBSERVICE("https://example.com")', "=FILTER(A1:A2,1)", "=NOSUCHFUNCTION(1)"],
      ],
    },
  ]);
  assert.equal(out.sheets[0].rows[0][0], "#DIV/0!");
  assert.equal(out.sheets[0].rows[0][1], "#DIV/0!");
  assert.equal(out.sheets[0].rows[0][2], "#REF!");
  assert.match(out.sheets[0].rows[1][0], /^#/);
  assert.equal(out.sheets[0].rows[3][0], "#UNSUPPORTED!");
  assert.equal(out.issues.length, 9);
});
test("full-column scans are bounded and calculated formula-like text is escaped", () => {
  const out = calculateWorkbook([{ name: "Data", rows: [["=SUM(B:B)", '=\"=1+1\"']] }], 100);
  assert.ok(out.issues.length > 0);
  assert.equal(out.sheets[0].rows[0][1], "'=1+1");
});
test("operational template outputs agree with independently calculated baselines", () => {
  const outputs = OPERATIONS_TEMPLATES.map((t) => calculateWorkbook(t.build()));
  for (const output of outputs) assert.deepEqual(output.issues, []);
  assert.equal(outputs[0].sheets[0].rows[3][3], "242");
  assert.ok(Math.abs(Number(outputs[0].sheets[0].rows[3][4]) - 265 / 300) < 1e-14);
  assert.equal(outputs[1].sheets[0].rows[1][8], "87000");
  assert.equal(outputs[2].sheets[0].rows[1][7], "-5000");
  assert.equal(Number(outputs[2].sheets[0].rows[1][11]), 110000);
  assert.equal(outputs[3].sheets[0].rows[7][3], "26125");
});
