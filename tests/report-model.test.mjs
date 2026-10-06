import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDataModel, autoPage, runVisual } from "../src/lib/report-model.ts";
import { parseQuestion } from "../src/lib/report-qa.ts";
import { ALL_TEMPLATES } from "../src/lib/templates/index.ts";

const sheet = (name, rows) => ({ name, rows });

test("list table: slicer filters and cross-table relationships by field name", () => {
  const model = buildDataModel([
    sheet("Sales", [
      ["Sales log"],
      ["Region", "Product", "Revenue"],
      ["West", "A", "100"],
      ["East", "B", "50"],
      ["West", "B", "25"],
      ["Total", "", "175"],
    ]),
    sheet("Targets", [
      ["Region", "Target"],
      ["West", "200"],
      ["East", "80"],
    ]),
  ]);
  const sales = model.tables.find((t) => t.name === "Sales");
  assert.equal(sales.rows.length, 3, "total row excluded");
  const v = parseQuestion("revenue by region", model);
  assert.equal(v.type, "column");
  const rows = runVisual(v, model, {}).rows;
  assert.deepEqual(rows.map((r) => [r.label, r.v0]), [["West", 125], ["East", 50]]);
  const regionField = model.tables.find((t) => t.name === "Targets").fields[0].id;
  const card = parseQuestion("total revenue", model);
  assert.equal(runVisual(card, model, { [regionField]: ["East"] }).total.v0, 50);
});

test("statements unpivot and never sum different line items", () => {
  const model = buildDataModel([
    sheet("P&L", [
      ["Line", "FY2025", "FY2026", "FY2027"],
      ["Revenue", "100", "120", "150"],
      ["EBITDA", "20", "30", "45"],
      ["EBITDA margin %", "0.2", "0.25", "0.3"],
    ]),
  ]);
  const t = model.tables[0];
  assert.equal(t.shape, "matrix");
  const page = autoPage(t);
  const revenueCard = page.visuals.find((v) => v.type === "card" && v.title === "Revenue");
  assert.equal(runVisual(revenueCard, model, {}).total.v0, 150, "latest period only");
  const period = t.fields[1].id;
  assert.equal(runVisual(revenueCard, model, { [period]: ["FY2025"] }).total.v0, 100);
  const q = parseQuestion("ebitda over time", model);
  assert.deepEqual(runVisual(q, model, {}).rows.map((r) => r.v0), [20, 30, 45]);
});

test("every built-in template yields a report with data", () => {
  for (const tpl of ALL_TEMPLATES) {
    const model = buildDataModel(tpl.build());
    assert.ok(model.tables.length > 0, `${tpl.name} has tables`);
    const visuals = model.tables.flatMap((t) => autoPage(t).visuals);
    const withData = visuals.filter((v) => (runVisual(v, model, {})?.rows.length ?? 0) > 0);
    assert.ok(withData.length > 0, `${tpl.name} renders`);
  }
});

test("KPI rows starting with 'Total' are kept; true total rows are dropped", () => {
  const model = buildDataModel([
    sheet("KPIs", [
      ["KPI", "Value"],
      ["Total payment volume", "1000"],
      ["Net revenue", "9"],
      ["Fraud losses", "1"],
    ]),
    sheet("Sales", [
      ["Region", "Revenue"],
      ["West", "60"],
      ["East", "40"],
      ["Total revenue", "100"],
    ]),
  ]);
  assert.equal(model.tables.find((t) => t.name === "KPIs").rows.length, 3);
  assert.equal(model.tables.find((t) => t.name === "Sales").rows.length, 2);
});
