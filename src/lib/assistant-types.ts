import type { Sheet } from "./spreadsheet";
import type { AuditIssue } from "./formula-audit";

export type AssistantProvider = "local" | "ollama" | "openai" | "lovable";
export type AssistantRequest = {
  prompt: string;
  sheets: Sheet[];
  history: { role: "user" | "assistant"; content: string }[];
  mode: "ask" | "edit";
  activeSheet?: string | undefined;
};
export type AgentResult = {
  reply: string;
  sheets: Sheet[];
  formulas: string[];
  vba: string;
  issues: AuditIssue[];
  fixes: string[];
  model: string;
  mode: "ask" | "edit";
};
export type LocalAiConfig = { endpoint: string; model: string };
export const PROVIDER_LABELS: Record<AssistantProvider, string> = {
  local: "Local tools",
  ollama: "Local AI · Ollama",
  openai: "GPT-6 Astra · Max",
  lovable: "Lovable AI",
};
