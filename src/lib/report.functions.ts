import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { streamGatewayResponses, RESEARCH_MODEL } from "./web-research.server";

const FieldSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  kind: z.enum(["category", "number", "date"]),
  samples: z.array(z.string().max(80)).max(40),
});
const InputSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  tables: z
    .array(z.object({ name: z.string().max(100), fields: z.array(FieldSchema).max(80) }))
    .min(1)
    .max(30),
});

const VISUAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "type", "table", "category", "values", "pins", "sort", "topN", "title"],
  properties: {
    answer: {
      type: "string",
      description: "One short sentence telling the user what the visual shows.",
    },
    type: {
      type: "string",
      enum: ["card", "column", "bar", "line", "area", "pie", "donut", "table", "scatter"],
    },
    table: { type: "string" },
    category: {
      type: ["string", "null"],
      description: "Field id to group by, or null for a single total.",
    },
    values: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "agg"],
        properties: {
          field: { type: "string" },
          agg: { type: "string", enum: ["sum", "avg", "count", "distinct", "min", "max"] },
        },
      },
    },
    pins: {
      type: "array",
      description:
        "Visual-level filters, e.g. keep only the 'Revenue' line item or only Region 'West'. Empty array when none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "values"],
        properties: {
          field: { type: "string" },
          values: { type: "array", items: { type: "string" } },
        },
      },
    },
    sort: { type: "string", enum: ["value-desc", "value-asc", "label"] },
    topN: { type: ["integer", "null"] },
    title: { type: "string" },
  },
} as const;

export type QaVisual = {
  answer: string;
  type: string;
  table: string;
  category: string | null;
  values: { field: string; agg: string }[];
  pins: { field: string; values: string[] }[];
  sort: string;
  topN: number | null;
  title: string;
};
export type QaResponse = { ok: true; visual: QaVisual } | { ok: false; message: string };

export const askReportQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<QaResponse> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, message: "AI Q&A needs Lovable AI to be connected." };
    const schemaText = data.tables
      .map(
        (t) =>
          `Table "${t.name}":\n${t.fields
            .map(
              (f) => `  - id=${f.id} name="${f.name}" kind=${f.kind} e.g. ${f.samples.join(" | ")}`,
            )
            .join("\n")}`,
      )
      .join("\n");
    try {
      const output = await streamGatewayResponses(
        key,
        {
          model: RESEARCH_MODEL,
          reasoning: { effort: "low" },
          instructions:
            "You are the Q&A engine of a Power BI report. Turn the user's question into ONE visual over the data model. Use only table names and field ids listed. 'values' are measures (kind=number fields, or count/distinct of any field). 'category' is the field to group by (kind=category or date), null for a single KPI card. Use line/area for trends over periods or dates, pie/donut for share of a total with few categories, bar for rankings with many categories, table for detail, scatter to compare two measures. Rates and percentages use avg, never sum. Tables whose fields are Line item / Period / Value are financial statements: pin the Line item to the line(s) asked about and never sum different line items together. Pin values must be copied exactly from the examples.",
          input: `DATA MODEL\n${schemaText}\n\nQUESTION: ${data.question}`,
          text: {
            format: { type: "json_schema", name: "visual", strict: true, schema: VISUAL_SCHEMA },
          },
        },
        new AbortController().signal,
      );
      const text = output
        .filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text ?? "")
        .join("");
      if (!text.trim()) return { ok: false, message: "The AI could not answer that question." };
      return { ok: true, visual: JSON.parse(text) as QaVisual };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      console.error("report_qa_failed", status, error instanceof Error ? error.message : error);
      return {
        ok: false,
        message:
          status === 402
            ? "AI credits are used up. Add credits in your workspace billing settings."
            : status === 429
              ? "The AI is busy right now. Wait a moment and try again."
              : "The AI could not answer that question. Try naming a column, e.g. “Revenue by Region”.",
      };
    }
  });
