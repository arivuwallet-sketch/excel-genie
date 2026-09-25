import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TEMPLATES } from "../src/lib/templates/index.ts";
import { validateWorkbook } from "../src/lib/workbook-limits.ts";
import { auditAndRepair } from "../src/lib/formula-audit.ts";
for (const template of ALL_TEMPLATES)
  test(`template ${template.id} has valid structure and references`, () => {
    const sheets = template.build();
    validateWorkbook(sheets);
    const serious = auditAndRepair(sheets).issues.filter((i) =>
      ["missing-sheet", "circular-ref", "out-of-range", "text-in-math", "audit-limit"].includes(
        i.kind,
      ),
    );
    assert.deepEqual(serious, []);
  });
