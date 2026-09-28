import { generateProposal } from "./agent-core.ts";
import { agentInput, agentSystem } from "./agent-prompt.ts";
import type { AgentResult, AssistantRequest, LocalAiConfig } from "./assistant-types.ts";

type ModelDetails = {
  remote_host?: string;
  remote_model?: string;
  details?: { format?: string };
  capabilities?: string[];
  model_info?: Record<string, unknown>;
};
type LocalModel = {
  name: string;
  size?: number;
  details?: { format?: string };
  remote_host?: string;
  remote_model?: string;
};
const isCloudName = (name: string) => /(?:[:/-]cloud)(?:$|[:/-])/i.test(name);

export function localEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a local Ollama address, such as http://127.0.0.1:11434.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Local AI only accepts a loopback address on this device, without credentials or a path.",
    );
  return url.origin;
}

async function localJson<T>(
  endpoint: string,
  path: string,
  signal: AbortSignal,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetcher(`${localEndpoint(endpoint)}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new Error(
      "Cannot reach local Ollama. Start Ollama, allow this site's exact origin in OLLAMA_ORIGINS, and allow browser local-network access if prompted. You can still use Local tools.",
      { cause: error },
    );
  }
  if (!response.ok)
    throw new Error(
      `Local Ollama returned HTTP ${response.status}. Check that the downloaded model is available and fits this device's memory. No cloud provider was called.`,
    );
  const value = await response.json();
  if (value?.error)
    throw new Error(
      "Ollama could not complete the local request. Check the model and available device memory.",
    );
  return value as T;
}

export async function listLocalModels(
  endpoint: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const data = await localJson<{ models?: LocalModel[] }>(
    endpoint,
    "tags",
    signal,
    undefined,
    fetcher,
  );
  if (!Array.isArray(data.models))
    throw new Error("This address did not return an Ollama model list.");
  return [
    ...new Set(
      data.models
        .filter(
          (m) =>
            typeof m.name === "string" &&
            m.name.length <= 200 &&
            !isCloudName(m.name) &&
            !m.remote_host &&
            !m.remote_model &&
            m.details?.format === "gguf" &&
            (m.size ?? 0) > 0,
        )
        .map((m) => m.name),
    ),
  ].sort();
}

export async function checkLocalModel(
  config: LocalAiConfig,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  localEndpoint(config.endpoint);
  if (!config.model || config.model.length > 200 || isCloudName(config.model))
    throw new Error("Select a downloaded local model. Cloud models are not supported in Local AI.");
  const data = await localJson<ModelDetails>(
    config.endpoint,
    "show",
    signal,
    { model: config.model, verbose: false },
    fetcher,
  );
  if (
    data.remote_host ||
    data.remote_model ||
    data.details?.format !== "gguf" ||
    !data.model_info ||
    typeof data.model_info["general.architecture"] !== "string"
  )
    throw new Error(
      "Could not verify downloaded model weights. Use a local GGUF model and disable Ollama Cloud (OLLAMA_NO_CLOUD=1).",
    );
  if (!data.capabilities?.includes("completion"))
    throw new Error("This model cannot generate text. Select a local chat model.");
  const architecture = data.model_info["general.architecture"];
  const context = data.model_info[`${architecture}.context_length`];
  return {
    contextLength:
      typeof context === "number" && Number.isFinite(context) ? Math.min(32768, context) : 16384,
  };
}

export async function runLocalAi(
  data: AssistantRequest,
  config: LocalAiConfig,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AgentResult> {
  // Verify local weights before transmitting workbook context; aliases are rechecked every request.
  const { contextLength } = await checkLocalModel(config, signal, fetcher);
  const system = agentSystem(data.mode);
  const prompt = agentInput(
    {
      ...data,
      history: data.history.slice(-4).map((m) => ({ ...m, content: m.content.slice(0, 1500) })),
    },
    12000,
  );
  const outputBudget = Math.min(4096, Math.floor(contextLength / 4));
  const result = await generateProposal({
    sheets: data.sheets,
    mode: data.mode,
    prompt,
    complete: async (input) => {
      // UTF-8 bytes conservatively bound text tokens, leaving room for response and chat framing.
      if (new TextEncoder().encode(system + input).length + outputBudget + 1024 > contextLength)
        throw new Error(
          "This request exceeds the local model's safe context budget. Use a smaller workbook or prompt, or select a model with a larger context. Local tools can analyze all rows directly.",
        );
      const response = await localJson<{
        model?: string;
        message?: { content?: string };
        done?: boolean;
        done_reason?: string;
      }>(
        config.endpoint,
        "chat",
        signal,
        {
          model: config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: input },
          ],
          stream: false,
          format: "json",
          options: { num_ctx: contextLength, num_predict: outputBudget, temperature: 0 },
        },
        fetcher,
      );
      if (!response.done)
        throw new Error("The local model did not complete its response. No changes applied.");
      if (response.model !== config.model)
        throw new Error("Ollama returned a different model. Reconnect the intended local model.");
      return {
        text: response.message?.content ?? "",
        finishReason: response.done_reason ?? "stop",
      };
    },
  });
  return { ...result, model: `Local AI · ${config.model}`, mode: data.mode };
}
