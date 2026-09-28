import { z } from "zod";
import type { Sheet } from "./spreadsheet";
import { SheetOpSchema } from "./sheet-ops.ts";
import { applyOperations } from "./workbook-operations.ts";
import { validateWorkbook } from "./workbook-limits.ts";
import { auditAndRepair } from "./formula-audit.ts";
import { hasUnsafeFormula } from "./formula-safety.ts";

const Cell = z
  .union([z.string(), z.number().finite(), z.boolean(), z.null()])
  .transform((v) => (v === null ? "" : String(v)));
const Output = z.object({
  reply: z.string().trim().min(1).max(30000),
  operations: z.array(SheetOpSchema).max(200).default([]),
  formulas: z.array(z.string().max(10000)).max(200).default([]),
  vba: z.string().max(50000).default(""),
});
export type AgentFailure = { code: string; message: string; retryable: boolean };
export class ProposalError extends Error {}

export function classifyAgentError(error: unknown): AgentFailure {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const e = current as {
      statusCode?: number;
      status?: number;
      name?: string;
      cause?: unknown;
      lastError?: unknown;
    };
    const status = e.statusCode ?? e.status;
    if (status === 401 || status === 403)
      return {
        code: "AI_AUTH",
        message:
          "The AI connection was rejected. The project owner must check the selected provider and server key. Your workbook is unchanged.",
        retryable: false,
      };
    if (status === 402)
      return {
        code: "AI_CREDITS",
        message:
          "The AI service has no available credits. Choose Local tools or Local AI to continue without provider credits, or check the selected provider's billing.",
        retryable: false,
      };
    if (status === 404)
      return {
        code: "AI_MODEL",
        message:
          "The selected AI model is unavailable for this account. Check provider access. No fallback model was used.",
        retryable: false,
      };
    if (status === 422)
      return {
        code: "AI_DECLINED",
        message:
          "The model could not fulfill this request. Try a more specific spreadsheet task. Your workbook is unchanged.",
        retryable: false,
      };
    if (status === 429)
      return {
        code: "AI_RATE_LIMIT",
        message:
          "The AI service is busy or rate limited. Wait a moment and retry; your workbook is unchanged.",
        retryable: true,
      };
    if (status && status >= 500)
      return {
        code: "AI_SERVICE",
        message:
          "The AI service is temporarily unavailable. Retry shortly or use a local workflow.",
        retryable: true,
      };
    if (e.name === "TimeoutError" || e.name === "AbortError")
      return {
        code: "AI_TIMEOUT",
        message:
          "The AI request timed out. Your workbook is unchanged. Retry with fewer changes or use a local workflow.",
        retryable: true,
      };
    current = e.lastError ?? e.cause;
  }
  return {
    code: "AI_CONNECTION",
    message:
      "Could not complete the AI connection. Check connectivity and the configured provider, then retry. Your workbook is unchanged.",
    retryable: true,
  };
}

function normalizeCells(operation: unknown) {
  if (!operation || typeof operation !== "object") return operation;
  const op = { ...operation } as Record<string, unknown>;
  for (const field of ["rows", "values"])
    if (Array.isArray(op[field]))
      op[field] = op[field].map((row) =>
        Array.isArray(row) ? row.map((value) => Cell.parse(value)) : row,
      );
  if (Array.isArray(op["cells"]))
    op["cells"] = op["cells"].map((cell) =>
      cell && typeof cell === "object" ? { ...cell, value: Cell.parse(cell.value) } : cell,
    );
  return op;
}

export function parseAgentResponse(text: string, mode: "ask" | "edit") {
  const trimmed = text.trim();
  if (!trimmed) throw new ProposalError("The model returned an empty response.");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1];
  const candidate = (fenced ?? trimmed).trim();
  if (mode === "ask" && !candidate.startsWith("{"))
    return { reply: trimmed.slice(0, 30000), operations: [], formulas: [], vba: "" };
  try {
    const raw = JSON.parse(candidate);
    if (Array.isArray(raw.operations)) raw.operations = raw.operations.map(normalizeCells);
    return Output.parse(raw);
  } catch {
    throw new ProposalError(
      "Return a JSON object with reply, operations, formulas and vba. Use only supported operations and scalar cell values.",
    );
  }
}

export function validateAgentResponse(text: string, sheets: Sheet[], mode: "ask" | "edit") {
  const parsed = parseAgentResponse(text, mode);
  if (mode === "ask" && parsed.operations.length)
    throw new ProposalError("Ask mode must return no operations.");
  if (hasUnsafeFormula(parsed.operations))
    throw new ProposalError("External links and executable formulas are not permitted.");
  const applied = applyOperations(sheets, parsed.operations);
  if (applied.problems.length) throw new ProposalError(applied.problems.join("; "));
  return {
    ...parsed,
    sheets: applied.sheets,
    issues: auditAndRepair(applied.sheets).issues,
    fixes: [] as string[],
  };
}

export { requestPrerequisite } from "./request-prerequisites.ts";

export async function generateProposal(options: {
  sheets: Sheet[];
  mode: "ask" | "edit";
  prompt: string;
  complete: (prompt: string) => Promise<{ text: string; finishReason?: string }>;
}) {
  validateWorkbook(options.sheets);
  let prompt = options.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Provider errors intentionally bypass the JSON repair path.
    const response = await options.complete(prompt);
    if (response.finishReason === "length")
      throw new ProposalError(
        "The response exceeded the output limit. Split the request into smaller steps.",
      );
    try {
      return validateAgentResponse(response.text, options.sheets, options.mode);
    } catch (error) {
      if (!(error instanceof ProposalError) || attempt === 1) throw error;
      prompt = `${options.prompt}\nYour previous response was rejected: ${error.message.slice(0, 1500)}\nNo changes have been applied. Return a corrected JSON object.`;
    }
  }
  throw new ProposalError("No usable response.");
}
