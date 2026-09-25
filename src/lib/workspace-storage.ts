import type { Sheet } from "./spreadsheet";
import { validateWorkbook } from "./workbook-limits.ts";
export const WORKSPACE_KEY = "sheetsmith.workspace.v1";
export type Workspace = {
  version: 1;
  sheets: Sheet[];
  messages: { role: "user" | "assistant"; content: string }[];
  fileName: string | null;
  savedAt: string;
};
export function parseWorkspace(text: string): Workspace {
  if (text.length > 8000000) throw new Error("Workspace is too large.");
  const data = JSON.parse(text);
  if (
    data?.version !== 1 ||
    !Array.isArray(data.sheets) ||
    !data.sheets.every(
      (s: Sheet) =>
        typeof s?.name === "string" &&
        Array.isArray(s.rows) &&
        s.rows.every((r) => Array.isArray(r) && r.every((v) => typeof v === "string")),
    )
  )
    throw new Error("Invalid workspace backup.");
  validateWorkbook(data.sheets);
  const messages = Array.isArray(data.messages)
    ? data.messages
        .filter(
          (m: { role: string; content: string }) =>
            m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
        )
        .slice(-100)
        .map((m: { role: "user" | "assistant"; content: string }) => ({
          role: m.role,
          content: m.content.slice(0, 30000),
        }))
    : [];
  return {
    version: 1,
    sheets: data.sheets,
    messages,
    fileName: typeof data.fileName === "string" ? data.fileName : null,
    savedAt: typeof data.savedAt === "string" ? data.savedAt : "",
  };
}
export function downloadWorkspace(workspace: Workspace) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(workspace)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sheetsmith-workspace.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
