import type { AgentResult, AssistantRequest } from "./assistant-types.ts";
import { auditAndRepair } from "./formula-audit.ts";
import {
  cleanSheet,
  columnLabel,
  pivotSheet,
  profileSheet,
  workbookDiff,
  type CleanAction,
} from "./workbook-intelligence.ts";
import { sanitizeSheetName } from "./spreadsheet.ts";
import { validateWorkbook } from "./workbook-limits.ts";
import { requestPrerequisite } from "./request-prerequisites.ts";

export const LOCAL_PROMPTS = [
  "Summarize this sheet",
  "Audit my formulas and list broken references",
  "Trim whitespace",
  "Remove duplicate rows",
  "Remove blank rows",
  'Sum "Amount" by "Category"',
];

const HELP = `Local tools run on this device without API keys or provider credits. Select a sheet, then try:

- **Summarize this sheet** — row counts, missing data, duplicates and numeric statistics.
- **Audit my formulas** — static reference checks across the workbook.
- **Trim whitespace**, **Remove duplicate rows**, or **Remove blank rows** — reviewed cleaning proposals.
- **Sum "Amount" by "Category"** or **Average "Amount" by "Category"** — use your exact column headers.
- **Count rows by "Category"** — a grouped row count.

Open **Workflows** for reconciliation, joins, consolidation, replacement, splitting and scenarios; **Templates** for workbook builders; **Calculate** for supported formulas. For open-ended language requests, connect a downloaded model under **Local AI · Ollama**. Local tools use explicit commands and do not call an AI model.`;

function escape(value: string) {
  return value
    .replace(/[\\`*_{}[\]()<>|#!]/g, "\\$&")
    .replace(/[\r\n]/g, " ")
    .slice(0, 150);
}
function number(value: number | null) {
  return value === null
    ? "—"
    : Number.isFinite(value)
      ? String(Number(value.toPrecision(12)))
      : "Overflow";
}

/** Conservative command grammar: unsupported or compound requests never partially edit data. */
export function runLocalAssistant(data: AssistantRequest): AgentResult {
  validateWorkbook(data.sheets);
  const result = (
    reply: string,
    sheets = data.sheets,
    issues = [] as AgentResult["issues"],
  ): AgentResult => ({
    reply,
    sheets,
    issues,
    formulas: [],
    vba: "",
    fixes: [],
    model: "Local tools · deterministic",
    mode: data.mode,
  });
  const prerequisite = requestPrerequisite(data.prompt, data.sheets);
  if (prerequisite) return result(prerequisite);
  const sheet = data.sheets.find((s) => s.name === data.activeSheet) ?? data.sheets[0]!;
  const command = data.prompt
    .trim()
    .replace(/^please\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  if (/^(?:help|what can you do|show (?:commands|local tools))$/i.test(command))
    return result(HELP);
  if (
    /^(?:summari[sz]e|profile|analy[sz]e)(?: (?:this|the|my|active))?(?: (?:sheet|data|worksheet))?$/i.test(
      command,
    )
  ) {
    const p = profileSheet(sheet);
    const details = p.columns.map((c) => {
      const range = `${columnLabel(c.index)}2:${columnLabel(c.index)}${Math.max(2, sheet.rows.length)}`;
      return `| ${escape(c.name)} (${range}) | ${c.missing} | ${c.numeric} | ${number(c.sum)} | ${number(c.mean)} | ${number(c.min)} | ${number(c.max)} |`;
    });
    return result(
      `**${escape(sheet.name)} — full-data profile**\n\n${p.rows} nonblank data rows · ${p.columns.length} columns · ${p.missing} missing cells · ${p.duplicates} repeated rows · ${p.blankRows} blank rows.\n\n| Column (source range) | Missing | Numeric values | Sum | Mean | Min | Max |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${details.join("\n")}\n\nRow 1 is treated as headers. All nonblank data rows are scanned. Numeric statistics exclude formulas, text and identifier-like numbers; currencies are not converted. Displayed statistics use up to 12 significant digits. Repeated rows use exact cell text. ${p.formulas ? `${p.formulas} formula cells are excluded; use Calculate to review supported results.` : "No formulas found in data rows."}`,
    );
  }
  if (
    /^(?:audit(?: (?:my |the |all )?(?:formulas|workbook))?|check (?:my |the )?formulas)(?: and list broken references)?$/i.test(
      command,
    )
  ) {
    const { issues } = auditAndRepair(data.sheets);
    const lines = issues
      .slice(0, 40)
      .map((i) => `- **${escape(i.sheet)}!${i.cell}**: ${escape(i.detail)}`);
    return result(
      `**Workbook formula audit**\n\n${issues.length ? `${issues.length} findings.\n\n${lines.join("\n")}${issues.length > 40 ? `\n\nShowing the first 40 of ${issues.length}.` : ""}` : "No issues detected by the supported static checks."}\n\nThis checks references and common formula risks; it does not calculate or guarantee Excel compatibility. No cells changed.`,
      data.sheets,
      issues,
    );
  }
  let action: CleanAction | undefined;
  if (
    /^(?:trim (?:white\s*space|spaces)|clean white\s*space)(?: (?:in|from) (?:this|the|my) sheet)?$/i.test(
      command,
    )
  )
    action = "trim";
  if (
    /^(?:remove (?:exact )?duplicate rows|deduplicate(?: (?:this|the|my) sheet)?)$/i.test(command)
  )
    action = "deduplicate";
  if (/^remove (?:blank|empty) rows$/i.test(command)) action = "remove_blank_rows";
  if (action) {
    if (data.mode === "ask")
      return result(
        "Ask mode is read only. Switch to Build / edit to preview this cleaning operation.",
      );
    const clean = cleanSheet(sheet, action);
    if (
      clean.rows.length !== sheet.rows.length &&
      data.sheets.some((s) => s.rows.some((r) => r.some((v) => v.trimStart().startsWith("="))))
    )
      return result(
        "Removing rows could shift formula references in this workbook. Create a values copy using Calculate before removing rows, or use targeted edits. No cells changed.",
      );
    const after = data.sheets.map((s) => (s === sheet ? clean : s));
    validateWorkbook(after);
    const diff = workbookDiff(data.sheets, after);
    return result(
      diff.total || clean.rows.length !== sheet.rows.length
        ? `Review the proposed cleaning of **${escape(sheet.name)}**: ${diff.total} cell differences and ${sheet.rows.length - clean.rows.length} removed rows. ${action === "trim" ? "Only leading and trailing whitespace will be removed. Formula-like text is preserved." : "Row 1 is preserved as headers; other sheets remain unchanged."}`
        : `No matching changes needed in **${escape(sheet.name)}**.`,
      after,
    );
  }
  const grouped = /^(sum|average) "([^"\r\n]+)" by "([^"\r\n]+)"$/i.exec(command);
  const count = /^count rows by "([^"\r\n]+)"$/i.exec(command);
  if (grouped || count) {
    const aggregation = count ? "count" : (grouped![1]!.toLowerCase() as "sum" | "average");
    const valueHeader = grouped?.[2];
    const groupHeader = count?.[1] ?? grouped![3]!;
    const headers = sheet.rows[0] ?? [];
    const resolve = (header: string) => {
      const matches = headers
        .map((h, i) => (h.trim().toLowerCase() === header.trim().toLowerCase() ? i : -1))
        .filter((i) => i >= 0);
      return matches.length === 1 ? matches[0]! : -1;
    };
    const group = resolve(groupHeader),
      value = valueHeader ? resolve(valueHeader) : group;
    if (group < 0 || value < 0)
      return result(
        `Use unique, exact headers from row 1. Available headers: ${headers.map(escape).join(", ")}. Example: Sum "Amount" by "Category".`,
      );
    if (
      sheet.rows
        .slice(1)
        .some((r) => [r[group], r[value]].some((v) => v?.trimStart().startsWith("=")))
    )
      return result(
        "The grouping or value column contains formulas. Create a values copy using Calculate first so the summary uses reviewed results.",
      );
    const summary = pivotSheet(sheet, group, value, aggregation);
    summary.name = sanitizeSheetName(
      summary.name,
      new Set(data.sheets.map((s) => s.name.toLowerCase())),
    );
    const preview = summary.rows
      .slice(1, 31)
      .map((r) => `| ${escape(r[0] || "(blank)")} | ${r[1] || "—"} |`)
      .join("\n");
    const description = `**${aggregation} by ${escape(groupHeader)} — ${escape(sheet.name)}**\n\n| Group | ${aggregation} |\n| --- | ---: |\n${preview}\n\n${summary.rows.length - 1} groups from all nonblank data rows; first 30 groups shown. ${aggregation === "count" ? "Counts rows, including rows with a blank group." : "Only numeric values contribute; text and blanks are excluded. Currencies are not converted."}`;
    if (data.mode === "ask") return result(`${description}\n\nAsk mode: no output sheet created.`);
    const after = [...data.sheets, summary];
    validateWorkbook(after);
    return result(
      `${description}\n\nReview the new **${escape(summary.name)}** sheet before applying.`,
      after,
    );
  }
  return result(
    `This request needs a guided workflow or an AI model. No cells changed.\n\n${HELP}`,
  );
}
