// This module is only imported by the server function. No key reaches the browser.
export const ASTRA_MODEL = "gpt-6-astra";

type ResponsesOutput = {
  status?: string;
  model?: string;
  incomplete_details?: { reason?: string };
  output?: { type: string; content?: { type: string; text?: string }[] }[];
};

export async function completeAstra(
  options: { key: string; system: string; prompt: string; signal: AbortSignal },
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.key}`, "Content-Type": "application/json" },
    signal: options.signal,
    redirect: "error",
    body: JSON.stringify({
      model: ASTRA_MODEL,
      reasoning: { effort: "max" },
      instructions: options.system,
      input: options.prompt,
      text: { format: { type: "json_object" } },
      max_output_tokens: 32768,
      store: false,
    }),
  });
  if (!response.ok)
    throw Object.assign(new Error("OpenAI request failed"), { statusCode: response.status });
  const data = (await response.json()) as ResponsesOutput;
  if (data.status === "incomplete" && data.incomplete_details?.reason === "max_output_tokens")
    return { text: "", finishReason: "length" };
  if (data.status !== "completed") throw new Error("OpenAI response did not complete");
  if (data.model !== ASTRA_MODEL && !data.model?.startsWith(`${ASTRA_MODEL}-`))
    throw new Error("OpenAI returned an unexpected model");
  const content = (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);
  if (content.some((item) => item.type === "refusal"))
    throw Object.assign(new Error("The model declined this request"), { statusCode: 422 });
  const text = content
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("");
  if (!text.trim()) throw new Error("OpenAI returned no answer");
  return { text, finishReason: "stop" };
}
