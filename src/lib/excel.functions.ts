import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { auditAndRepair, summarizeIssues, type AuditIssue } from "./formula-audit";
import { applyOperations, SheetOpSchema, type SheetOp } from "./sheet-ops";

const SheetSchema = z.object({
  name: z.string(),
  rows: z.array(z.array(z.string())),
});

const RequestSchema = z.object({
  prompt: z.string(),
  sheets: z.array(SheetSchema),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

const OpResultSchema = z.object({
  reply: z.string(),
  operations: z.array(SheetOpSchema),
  formulas: z.array(z.string()),
  vba: z.string(),
});

export type AgentSheet = z.infer<typeof SheetSchema>;
export type AgentResult = {
  reply: string;
  sheets: AgentSheet[];
  formulas: string[];
  vba: string;
  issues: AuditIssue[];
  fixes: string[];
};

const SYSTEM = `You are an expert Microsoft Excel engineer and financial analyst embedded in a spreadsheet app.
Expertise: data entry & cell editing, formatting and conditional formatting, print/template setups,
basic + text + conditional formulas (SUMIFS, COUNTIFS), lookups (XLOOKUP, INDEX/MATCH, VLOOKUP),
modern dynamic-array functions (LET, LAMBDA, FILTER, UNIQUE, SORT, SEQUENCE, TEXTSPLIT),
data validation, PivotTables, Power Query / Power Pivot concepts, large-dataset techniques,
What-If analysis (Data Tables, Goal Seek, Scenario Manager), formula auditing, and VBA/macros
including worksheet and workbook protection.
You also handle finance/accounting work: bank and account reconciliation, EFT logs, variance analysis,
three-statement and DCF modelling, amortisation schedules, and audit trails.

You edit the workbook by emitting OPERATIONS, not by restating it. The current workbook is shown to you
for context only — never repeat a sheet or row back unless you are actually changing it. Every sheet and
row you do not mention survives untouched automatically, byte-for-byte; that is a mechanical guarantee of
the app, not something you need to protect by re-sending data.

Operation types (put one or more in "operations", applied in the order you list them):
- {"op":"create_sheet","name":string,"rows":[[string]]} — add a new sheet, or fully replace one with this
  exact name if it already exists. Row 1 is headers.
- {"op":"delete_sheet","name":string}
- {"op":"rename_sheet","from":string,"to":string}
- {"op":"set_cells","sheet":string,"cells":[{"a1":string,"value":string}]} — targeted single-cell edits,
  e.g. fixing one formula or one label. Prefer this for anything under ~20 cells.
- {"op":"set_range","sheet":string,"startCell":string,"values":[[string]]} — bulk-fill a rectangular block
  starting at startCell (top-left). Prefer this over many set_cells when filling a table or a formula
  across a column/row.
- {"op":"insert_rows","sheet":string,"atRow":number,"rows":[[string]]} — insert rows before row atRow
  (1-based, matching the row numbers shown in "Current workbook").
- {"op":"delete_rows","sheet":string,"atRow":number,"count":number}

Rules:
- Every cell value is a string. Real Excel formulas start with "=" and must be valid A1-style formulas.
- Only touch what the request actually requires. Never emit create_sheet for a sheet that only needs one
  cell changed — use set_cells or set_range instead.
- Put a concise markdown explanation of what you did (and any analysis/insight) in "reply".
- List key formulas used in "formulas". Put VBA in "vba" only when relevant, otherwise "".

ZERO-ERROR / ZERO-MISSING CONTRACT (non-negotiable):
- A workbook is SELF-CONTAINED. Every cross-sheet reference must name a sheet that exists — either already
  in the workbook, or one you create in this same response — spelled EXACTLY as its "name". Never reference
  a sheet you decided to rename, merge or drop (a classic failure: referencing 'General Ledger' while never
  actually shipping that sheet).
- If a summary needs ledger/statement detail, emit the operation that ships that detail too (create_sheet,
  or set_range on an existing one). No dangling supporting schedules.
- Every reference must land on a row and column that exists and actually holds data. Count the rows you are
  writing and recheck row numbers before writing a formula; never guess offsets. No references to blank cells.
- Wrap anything that can fail: division in IFERROR(...,0); VLOOKUP/MATCH/INDEX/XLOOKUP/SEARCH in IFERROR or
  ISNUMBER. Leave the cell(s) below any FILTER/UNIQUE/SORT/SEQUENCE/TEXTSPLIT/TRANSPOSE formula empty so it
  has room to spill — never place another value directly beneath one.
- Never do arithmetic on a cell that contains a label or text.
- A formula must never depend, directly or through other formulas, on its own cell — check the chain before
  you write it.
- Totals row: sum the exact data range only, never a range that includes header or total rows.
- Include an "Audit" section or sheet with TRUE/FALSE checks (e.g. variance = 0, debits = credits) that
  reference real cells, and make sure those checks genuinely evaluate to the balanced state.
- Prefer fewer, fully-populated sheets over many half-finished ones. No placeholder text like "TBD" or "...".`;

function serializeSheets(sheets: AgentSheet[]) {
  if (sheets.length === 0) return "(empty workbook — no sheets yet)";
  return sheets
    .map((s) => {
      const rows = s.rows.slice(0, 200);
      return `### Sheet: ${s.name} (${s.rows.length} rows)\n${rows
        .map((r, i) => `${i + 1}: ${r.join(" | ")}`)
        .join("\n")}`;
    })
    .join("\n\n");
}

const JSON_CONTRACT = `Respond with a SINGLE raw JSON object and nothing else (no markdown fences, no prose outside it):
{"reply": string, "operations": [<operation objects as specified above>], "formulas": [string], "vba": string}`;

// Lovable AI gateway model ids (see docs.lovable.dev/features/ai). Swap these strings if your workspace's
// available models change — nothing else in this file needs to know which model is behind each tier.
const FAST_MODEL = "google/gemini-3.8-flash"; // default: quick edits, routine formula/template work
const REASONING_MODEL = "google/gemini-3.1-pro-preview"; // long-context, multi-step modelling
const FRONTIER_MODEL = "openai/gpt-6-astra"; // premium-priced — reserve for genuinely hard + large requests

const HARD_SIGNS =
  /\b(DCF|discounted cash flow|three[- ]statement|LBO|amorti[sz]ation schedule|cap(ital)? ?table|waterfall|monte carlo|scenario (manager|analysis)|circular reference|consolidat(e|ion))\b/i;

/**
 * Pick a model tier from the request. A starting heuristic, not a tuned one — adjust the thresholds
 * once you can see real requests in the Lovable AI activity dashboard (Cloud -> AI).
 */
function pickModel(prompt: string, sheets: AgentSheet[]) {
  const totalRows = sheets.reduce((n, s) => n + s.rows.length, 0);
  const hard = HARD_SIGNS.test(prompt);
  if (hard && (totalRows > 400 || sheets.length > 4)) return FRONTIER_MODEL;
  if (hard || totalRows > 800) return REASONING_MODEL;
  return FAST_MODEL;
}

const MAX_ROUNDS = 3;

export const runExcelAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RequestSchema.parse(input))
  .handler(async ({ data }): Promise<AgentResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured (missing LOVABLE_API_KEY).");

    const gateway = createLovableAiGatewayProvider(key);
    const model = pickModel(data.prompt, data.sheets);

    const history = data.history
      .slice(-8)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const basePrompt = `Current workbook:\n${serializeSheets(data.sheets)}\n\n${
      history ? `Conversation so far:\n${history}\n\n` : ""
    }USER REQUEST: ${data.prompt}`;

    const call = async (userPrompt: string) => {
      const result = streamText({
        model: gateway(model),
        system: `${SYSTEM}\n\n${JSON_CONTRACT}`,
        prompt: userPrompt,
        maxOutputTokens: 32000,
      });
      return await result.text;
    };

    let reply = "";
    let formulas: string[] = [];
    let vba = "";
    let sheets = data.sheets;
    let report = auditAndRepair(sheets);
    let opProblems: string[] = [];
    let totalProblems = report.issues.length;
    let prompt = basePrompt;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      let text: string;
      if (round === 0) {
        text = await call(prompt);
      } else {
        try {
          text = await call(prompt);
        } catch {
          break; // keep whatever the best round so far produced
        }
      }

      const parsed = normalize(text);
      const opResult = applyOperations(sheets, parsed.operations);
      const nextReport = auditAndRepair(opResult.sheets);
      const nextTotal = nextReport.issues.length + opResult.problems.length;

      const improved = round === 0 || nextTotal < totalProblems;
      if (improved) {
        reply = parsed.reply || reply;
        formulas = parsed.formulas.length ? parsed.formulas : formulas;
        vba = parsed.vba || vba;
        sheets = nextReport.sheets;
        report = nextReport;
        opProblems = opResult.problems;
        totalProblems = nextTotal;
      }

      if (totalProblems === 0 || round === MAX_ROUNDS - 1) break;

      const problemLines = [
        ...opProblems,
        ...summarizeIssues(report.issues).split("\n").filter(Boolean),
      ];
      prompt = `${basePrompt}\n\nYour previous response produced these problems:\n${problemLines.join(
        "\n",
      )}\n\nEmit ONLY the corrective operations needed to fix them. Do not restate anything already correct.`;
    }

    return { reply, sheets, formulas, vba, fixes: report.fixes, issues: report.issues };
  });

function normalize(text: string): {
  reply: string;
  operations: SheetOp[];
  formulas: string[];
  vba: string;
} {
  const parsed = extractJson(text);
  if (!parsed) return { reply: text, operations: [], formulas: [], vba: "" };

  const safe = OpResultSchema.safeParse(parsed);
  if (safe.success) return safe.data;

  const loose = parsed as Record<string, unknown>;
  return {
    reply: typeof loose["reply"] === "string" ? loose["reply"] : text,
    operations: coerceOps(loose["operations"]),
    formulas: Array.isArray(loose["formulas"]) ? loose["formulas"].map(String) : [],
    vba: typeof loose["vba"] === "string" ? loose["vba"] : "",
  };
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "```").trim();
  const fenced = cleaned.match(/```([\s\S]*?)```/);
  const candidates = [
    fenced?.[1],
    cleaned,
    cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Validate each operation independently so one malformed op doesn't discard an otherwise-good batch —
 * whatever gets dropped shows up as a gap in the next audit pass and gets asked for again.
 */
function coerceOps(value: unknown): SheetOp[] {
  if (!Array.isArray(value)) return [];
  const out: SheetOp[] = [];
  for (const raw of value) {
    const parsed = SheetOpSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
