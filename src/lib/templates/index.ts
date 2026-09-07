import { ADVANCED_TEMPLATES } from "./advanced";
import { BASIC_TEMPLATES } from "./basic";
import { DASHBOARD_TEMPLATES } from "./dashboards";
import { INSTITUTIONAL_TEMPLATES } from "./institutional";
import { INTERMEDIATE_TEMPLATES } from "./intermediate";
import { QUANT_TEMPLATES } from "./quant";
import type { FinancialTemplate, TemplateTier } from "./types";

export type { FinancialTemplate, TemplateTier };

export const ALL_TEMPLATES: FinancialTemplate[] = [
  ...BASIC_TEMPLATES,
  ...INTERMEDIATE_TEMPLATES,
  ...ADVANCED_TEMPLATES,
  ...QUANT_TEMPLATES,
  ...DASHBOARD_TEMPLATES,
  ...INSTITUTIONAL_TEMPLATES,
];

export const TIERS: TemplateTier[] = [
  "Basic",
  "Intermediate",
  "Advanced",
  "Quantitative",
  "Dashboards",
  "Institutional",
];

export const templatesByTier = (tier: TemplateTier) =>
  ALL_TEMPLATES.filter((t) => t.tier === tier);

export const getTemplate = (id: string) => ALL_TEMPLATES.find((t) => t.id === id);

const STOP = new Set([
  "a", "an", "the", "and", "for", "with", "of", "to", "in", "on", "my", "me", "please",
  "create", "build", "make", "generate", "give", "need", "want", "new", "sheet", "excel",
  "spreadsheet", "workbook", "model", "template",
]);

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/** Best-effort match of a free-text request to a preset template. */
export function matchTemplate(query: string): FinancialTemplate | null {
  const q = tokens(query);
  if (!q.length) return null;
  let best: { t: FinancialTemplate; score: number } | null = null;
  for (const t of ALL_TEMPLATES) {
    const hay = new Set(tokens(`${t.id} ${t.name} ${t.blurb} ${t.features.join(" ")}`));
    let score = 0;
    for (const w of q) if (hay.has(w)) score += 1;
    if (!best || score > best.score) best = { t, score };
  }
  return best && best.score >= 2 ? best.t : null;
}
