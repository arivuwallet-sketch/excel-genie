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
- List key formulas used in "formulas". Put VBA in "vba" only when relevant, otherwise "".`;

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

    const result = streamText({
      model: gateway("google/gemini-3.7-flash"),
      system: `${SYSTEM}

Respond with a SINGLE raw JSON object and nothing else (no markdown fences, no prose outside it):
{"reply": string, "sheets": [{"name": string, "rows": [[string]]}], "formulas": [string], "vba": string}`,
      prompt,
      maxOutputTokens: 32000,
    });

    const text = await result.text;
    const parsed = extractJson(text);
    if (!parsed) return { reply: text, sheets: data.sheets, formulas: [], vba: "" };

    const safe = ResultSchema.safeParse(parsed);
    if (safe.success) return safe.data;

    const loose = parsed as Record<string, unknown>;
    return {
      reply: typeof loose["reply"] === "string" ? loose["reply"] : text,
      sheets: coerceSheets(loose["sheets"]) ?? data.sheets,
      formulas: Array.isArray(loose["formulas"]) ? loose["formulas"].map(String) : [],
      vba: typeof loose["vba"] === "string" ? loose["vba"] : "",
    };
  });

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

