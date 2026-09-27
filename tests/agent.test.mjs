import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAgentError,
  generateProposal,
  parseAgentResponse,
  requestPrerequisite,
} from "../src/lib/agent-core.ts";
const sheets = [
  {
    name: "Data",
    rows: [
      ["Item", "Amount"],
      ["A", "10"],
    ],
  },
];
test("provider failures keep their cause and never invoke JSON repair", async () => {
  for (const [statusCode, code] of [
    [401, "AI_AUTH"],
    [402, "AI_CREDITS"],
    [404, "AI_MODEL"],
    [429, "AI_RATE_LIMIT"],
    [503, "AI_SERVICE"],
  ]) {
    let calls = 0;
    const failure = Object.assign(new Error("private provider response"), { statusCode });
    await assert.rejects(
      generateProposal({
        sheets,
        mode: "edit",
        prompt: "edit",
        complete: async () => {
          calls++;
          throw failure;
        },
      }),
      (e) => e === failure,
    );
    assert.equal(calls, 1);
    assert.equal(classifyAgentError({ lastError: failure }).code, code);
    assert.ok(!classifyAgentError(failure).message.includes("private"));
  }
  assert.equal(classifyAgentError({ name: "TimeoutError" }).code, "AI_TIMEOUT");
});
test("model primitives normalize, optional fields default, and Ask accepts prose", () => {
  const parsed = parseAgentResponse(
    '```json\n{"reply":"Ready","operations":[{"op":"create_sheet","name":"Test","rows":[[1,true,null]]}]}\n```',
    "edit",
  );
  assert.deepEqual(parsed.operations[0].rows, [["1", "true", ""]]);
  assert.deepEqual(parsed.formulas, []);
  assert.equal(parseAgentResponse("The total is 10.", "ask").reply, "The total is 10.");
});
test("invalid proposal is repaired once; changes remain atomic", async () => {
  const original = structuredClone(sheets);
  let calls = 0;
  const result = await generateProposal({
    sheets,
    mode: "edit",
    prompt: "edit",
    complete: async () => ({
      text:
        ++calls === 1
          ? "invalid"
          : JSON.stringify({
              reply: "Proposed",
              operations: [{ op: "set_cells", sheet: "Data", cells: [{ a1: "B2", value: 25 }] }],
            }),
    }),
  });
  assert.equal(calls, 2);
  assert.equal(result.sheets[0].rows[1][1], "25");
  assert.deepEqual(sheets, original);
  calls = 0;
  await assert.rejects(
    generateProposal({
      sheets,
      mode: "ask",
      prompt: "ask",
      complete: async () => {
        calls++;
        return {
          text: JSON.stringify({
            reply: "Edit",
            operations: [{ op: "delete_sheet", name: "Data" }],
          }),
        };
      },
    }),
    /Ask mode/,
  );
  assert.equal(calls, 2);
});
test("empty reconciliation gets prerequisite guidance without AI", () => {
  assert.match(
    requestPrerequisite("Reconcile Sheet A and Sheet B and flag unmatched items", [
      { name: "Empty", rows: [[""]] },
    ]),
    /both source sheets/,
  );
  assert.equal(requestPrerequisite("Create a budget template", []), null);
});
test("unsafe operations never become proposals and truncated output is not retried", async () => {
  await assert.rejects(
    generateProposal({
      sheets,
      mode: "edit",
      prompt: "x",
      complete: async () => ({
        text: JSON.stringify({
          reply: "x",
          operations: [
            {
              op: "set_cells",
              sheet: "Data",
              cells: [{ a1: "A1", value: '=WEBSERVICE("https://example.com")' }],
            },
          ],
        }),
      }),
    }),
    /not permitted/,
  );
  let calls = 0;
  await assert.rejects(
    generateProposal({
      sheets,
      mode: "edit",
      prompt: "x",
      complete: async () => {
        calls++;
        return { text: "{", finishReason: "length" };
      },
    }),
    /output limit/,
  );
  assert.equal(calls, 1);
});
