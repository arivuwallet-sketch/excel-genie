// Server-only: live web research through the Lovable AI Gateway's Responses endpoint with the
// built-in web_search tool. Streams (SSE) so long searches never hit a buffered timeout.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
export const RESEARCH_MODEL = "openai/gpt-6-astra";

export type WebSource = { title: string; url: string };
export type WebResearch = { summary: string; sources: WebSource[] };

type Annotation = { type?: string; title?: string; url?: string };
export type OutputItem = {
  type: string;
  content?: { type: string; text?: string; annotations?: Annotation[] }[];
};

function cleanUrl(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.delete("utm_source");
    u.searchParams.delete("hss_meta");
    return u.toString();
  } catch {
    return url;
  }
}

export async function streamGatewayResponses(
  key: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<OutputItem[]> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true, store: false }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    console.error("web_research_failed", res.status, text.slice(0, 500));
    throw Object.assign(new Error(`Web research failed (${res.status})`), {
      statusCode: res.status,
    });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output: OutputItem[] | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data) as {
          type?: string;
          response?: { output?: OutputItem[]; error?: { message?: string } };
        };
        if (event.type === "response.completed" || event.type === "response.incomplete")
          output = event.response?.output ?? [];
        if (event.type === "response.failed" || event.type === "error")
          throw new Error(event.response?.error?.message ?? "Web research failed");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (!output) throw new Error("Web research ended without a result");
  return output;
}

/** Search the live web for facts the spreadsheet task depends on; returns a cited summary. */
export async function researchWeb(
  key: string,
  question: string,
  signal: AbortSignal,
): Promise<WebResearch> {
  const output = await streamGatewayResponses(
    key,
    {
      model: RESEARCH_MODEL,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
      instructions:
        "You are a research analyst supporting an Excel/Power BI modeler. Search the web for the current, factual data the user's task needs (rates, prices, market data, benchmarks, company figures, regulations). Reply in under 250 words: bullet points with exact numbers, units, and as-of dates. Say clearly when something could not be found. Never invent figures.",
      input: question.slice(0, 4000),
    },
    signal,
  );
  const parts = output.filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (parts.some((p) => p.type === "refusal"))
    throw Object.assign(new Error("The model declined this request"), { statusCode: 422 });
  const summary = parts
    .filter((p) => p.type === "output_text")
    .map((p) => p.text ?? "")
    .join("")
    // drop inline "([site](url))" citations — sources are listed separately
    .replace(/\s*\(\[[^\]]+\]\([^)]+\)\)/g, "")
    .trim();
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const p of parts)
    for (const a of p.annotations ?? [])
      if (a.type === "url_citation" && a.url) {
        const url = cleanUrl(a.url);
        if (seen.has(url)) continue;
        seen.add(url);
        sources.push({ title: a.title || new URL(url).hostname, url });
      }
  return { summary, sources: sources.slice(0, 8) };
}
