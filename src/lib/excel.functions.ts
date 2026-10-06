import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import {
  classifyAgentError,
  generateProposal,
  ProposalError,
  requestPrerequisite,
  type AgentFailure,
} from "./agent-core";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  validateWorkbook,
  MAX_ROWS,
  MAX_COLS,
  MAX_CELL_LENGTH,
  MAX_SHEETS,
} from "./workbook-limits";
import { agentInput, agentSystem } from "./agent-prompt";
import { completeAstra, ASTRA_MODEL } from "./openai-astra.server";
import { researchWeb, type WebResearch } from "./web-research.server";
const SheetSchema = z.object({
  name: z.string().min(1).max(31),
  rows: z.array(z.array(z.string().max(MAX_CELL_LENGTH)).max(MAX_COLS)).max(MAX_ROWS),
});
const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(12000),
  sheets: z.array(SheetSchema).min(1).max(MAX_SHEETS),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20000) }))
    .max(20),
  mode: z.enum(["ask", "edit"]).default("edit"),
  provider: z.enum(["openai", "lovable"]),
  quality: z.enum(["auto", "fast", "reasoning"]).default("auto"),
  activeSheet: z.string().max(31).optional(),
  webSearch: z.boolean().default(false),
});
import type { AgentResult } from "./assistant-types";
export type AgentResponse =
  { ok: true; result: AgentResult } | { ok: false; error: AgentFailure; requestId: string };
export const getAiStatus = createServerFn({ method: "GET" }).handler(async () => ({
  openai: !!process.env["OPENAI_API_KEY"],
  lovable: !!process.env["LOVABLE_API_KEY"],
  version: "excelgpt-3",
}));
export const runExcelAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RequestSchema.parse(input))
  .handler(async ({ data }): Promise<AgentResponse> => {
    const requestId = crypto.randomUUID();
    try {
      validateWorkbook(data.sheets);
      const prerequisite = requestPrerequisite(data.prompt, data.sheets);
      if (prerequisite)
        return {
          ok: true,
          result: {
            reply: prerequisite,
            sheets: data.sheets,
            formulas: [],
            vba: "",
            issues: [],
            fixes: [],
            model: "local",
            mode: data.mode,
          },
        };
      const isAstra = data.provider === "openai";
      const key = process.env[isAstra ? "OPENAI_API_KEY" : "LOVABLE_API_KEY"];
      if (!key)
        return {
          ok: false,
          requestId,
          error: {
            code: "AI_NOT_CONFIGURED",
            message: isAstra
              ? "GPT-6 Astra Max is not connected. It requires a server-side OpenAI API key and paid provider access. Choose Local tools or Local AI to work without provider credits."
              : "Lovable AI is not connected for this deployment. Enable the AI connector in Lovable and republish, or choose Local tools / Local AI without provider credits.",
            retryable: false,
          },
        };
      const reasoning =
        data.quality === "reasoning" ||
        (data.quality === "auto" &&
          /\b(DCF|LBO|reconcile|forecast|scenario|three.statement|audit)\b/i.test(data.prompt));
      const model = isAstra
        ? ASTRA_MODEL
        : reasoning
          ? process.env["EXCEL_AI_REASONING_MODEL"] || "google/gemini-3.1-pro-preview"
          : process.env["EXCEL_AI_FAST_MODEL"] || "google/gemini-3.8-flash";
      const gateway = isAstra ? null : createLovableAiGatewayProvider(key);
      const signal = AbortSignal.timeout(isAstra ? 300000 : 120000);
      let research: WebResearch | null = null;
      if (data.webSearch) {
        const lovableKey = process.env["LOVABLE_API_KEY"];
        if (!lovableKey)
          return {
            ok: false,
            requestId,
            error: {
              code: "AI_NOT_CONFIGURED",
              message: "Web search needs Lovable AI to be connected for this deployment.",
              retryable: false,
            },
          };
        research = await researchWeb(lovableKey, data.prompt, new AbortController().signal);
      }
      const base = research
        ? `${agentInput(data)}\n\nLIVE WEB RESEARCH (retrieved today; use these figures where relevant, put each in a labelled input cell and mention the source in a note column):\n${research.summary}\nSources:\n${research.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`
        : agentInput(data);
      const parsed = await generateProposal({
        sheets: data.sheets,
        mode: data.mode,
        prompt: base,
        complete: async (prompt) => {
          if (isAstra)
            return completeAstra({ key, system: agentSystem(data.mode), prompt, signal });
          const response = await generateText({
            model: gateway!(model),
            system: agentSystem(data.mode),
            prompt,
            maxOutputTokens: 16000,
            abortSignal: signal,
            maxRetries: 0,
          });
          return { text: response.text, finishReason: response.finishReason };
        },
      });
      return {
        ok: true,
        result: {
          ...parsed,
          reply:
            research && research.sources.length
              ? `${parsed.reply}\n\n**Web sources**\n${research.sources.map((s) => `- [${s.title}](${s.url})`).join("\n")}`
              : parsed.reply,
          model: `${isAstra ? `${model} · max` : model}${research ? " · web" : ""}`,
          mode: data.mode,
        },
      };
    } catch (error) {
      const failure =
        error instanceof ProposalError
          ? {
              code: "AI_PROPOSAL",
              message: `${error.message} Your workbook is unchanged.`,
              retryable: true,
            }
          : classifyAgentError(error);
      console.error("excelgpt_ai_failure", { requestId, code: failure.code });
      return { ok: false, requestId, error: failure };
    }
  });
