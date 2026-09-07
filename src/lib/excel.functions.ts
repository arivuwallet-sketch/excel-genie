import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { auditAndRepair, summarizeIssues, type AuditIssue } from "./formula-audit";

const SheetSchema = z.object({
  name: z.string(),
  rows: z.array(z.array(z.string())),
});

const RequestSchema = z.object({
  prompt: z.string(),
  sheets: z.array(SheetSchema),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

const ResultSchema = z.object({
  reply: z.string(),
  sheets: z.array(SheetSchema),
  formulas: z.array(z.string()),
  vba: z.string(),
});

export type AgentSheet = z.infer<typeof SheetSchema>;
export type AgentResult = z.infer<typeof ResultSchema> & {
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

Rules:
- Always return the FULL resulting workbook in "sheets" (every sheet, every row), row 1 being headers.
- Every cell is a string. Real Excel formulas start with "=" and must be valid A1-style formulas.
- Preserve untouched sheets exactly as given. Never invent data the user did not supply unless asked to generate a new sheet.
- Put a concise markdown explanation of what you did (and any analysis/insight) in "reply".
- List key formulas used in "formulas". Put VBA in "vba" only when relevant, otherwise "".

ZERO-ERROR / ZERO-MISSING CONTRACT (non-negotiable):
- A workbook is SELF-CONTAINED. Every cross-sheet reference must name a sheet you actually included
  in "sheets", spelled EXACTLY as in that sheet's "name". Never reference a sheet you decided to rename,
  merge or drop (a classic failure: referencing 'General Ledger' while only shipping an audit sheet).
- If a summary needs ledger/statement detail, SHIP that detail sheet too. No dangling supporting schedules.
- Every reference must land on a row and column that exists and actually holds data. Count the rows you
  emit and recheck each row number before writing a formula; never guess offsets. No references to blank cells.
- Wrap anything that can fail: division in IFERROR(...,0); VLOOKUP/MATCH/INDEX/XLOOKUP/SEARCH in IFERROR or ISNUMBER.
- Never do arithmetic on a cell that contains a label or text.
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
{"reply": string, "sheets": [{"name": string, "rows": [[string]]}], "formulas": [string], "vba": string}`;

export const runExcelAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RequestSchema.parse(input))
  .handler(async ({ data }): Promise<AgentResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured (missing LOVABLE_API_KEY).");

    const gateway = createLovableAiGatewayProvider(key);

    const history = data.history
      .slice(-8)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const prompt = `Current workbook:\n${serializeSheets(data.sheets)}\n\n${
      history ? `Conversation so far:\n${history}\n\n` : ""
    }USER REQUEST: ${data.prompt}`;

    const call = async (userPrompt: string) => {
      const result = streamText({
        model: gateway("google/gemini-3.7-flash"),
        system: `${SYSTEM}\n\n${JSON_CONTRACT}`,
        prompt: userPrompt,
        maxOutputTokens: 32000,
      });
      return await result.text;
    };

    const text = await call(prompt);
    let draft = normalize(text, data.sheets);

    // Validate + mechanically repair, then give the model ONE chance to fix
    // what needs judgement (missing sheets, dangling rows, empty maths).
    let report = auditAndRepair(draft.sheets);
    if (report.issues.length > 0) {
      try {
        const retry = await call(
          `${prompt}\n\nYour previous answer produced this workbook:\n${serializeSheets(
            report.sheets,
          )}\n\nA formula audit found these problems:\n${summarizeIssues(report.issues)}\n\n` +
            `Return the corrected FULL workbook. Add any supporting sheet you referenced but did not ship, ` +
            `fix every row/column number so each reference lands on real data, and guard fragile formulas. ` +
            `Do not drop existing content.`,
        );
        const fixed = normalize(retry, report.sheets);
        const second = auditAndRepair(fixed.sheets);
        if (second.issues.length < report.issues.length) {
          draft = { ...fixed, reply: draft.reply || fixed.reply };
          report = second;
        }
      } catch {
        // keep the first pass if the repair round trip fails
      }
    }

    return {
      reply: draft.reply,
      sheets: report.sheets,
      formulas: draft.formulas,
      vba: draft.vba,
      fixes: report.fixes,
      issues: report.issues,
    };
  });

function normalize(text: string, fallback: AgentSheet[]) {
  const parsed = extractJson(text);
  if (!parsed) return { reply: text, sheets: fallback, formulas: [] as string[], vba: "" };

  const safe = ResultSchema.safeParse(parsed);
  if (safe.success) return safe.data;

  const loose = parsed as Record<string, unknown>;
  return {
    reply: typeof loose["reply"] === "string" ? loose["reply"] : text,
    sheets: coerceSheets(loose["sheets"]) ?? fallback,
    formulas: Array.isArray(loose["formulas"]) ? loose["formulas"].map(String) : [],
    vba: typeof loose["vba"] === "string" ? loose["vba"] : "",
  };
}


function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "```").trim();
  const fenced = cleaned.match(/```([\s\S]*?)```/);
  const candidates = [fenced?.[1], cleaned, cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)];
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

function coerceSheets(value: unknown): AgentSheet[] | null {
  if (!Array.isArray(value)) return null;
  const sheets = value
    .map((s, i) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(o["rows"]) ? o["rows"] : [];
      return {
        name: typeof o["name"] === "string" && o["name"] ? o["name"] : `Sheet${i + 1}`,
        rows: rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c))) : [])),
      };
    })
    .filter((s) => s.rows.length > 0);
  return sheets.length ? sheets : null;
}

