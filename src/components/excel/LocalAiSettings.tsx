import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkLocalModel, listLocalModels } from "@/lib/local-ai";
import type { LocalAiConfig } from "@/lib/assistant-types";

export function LocalAiSettings({
  config,
  onConfig,
  disabled,
}: {
  config: LocalAiConfig | null;
  onConfig: (value: LocalAiConfig | null) => void;
  disabled: boolean;
}) {
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? "http://127.0.0.1:11434");
  const [models, setModels] = useState<string[]>(config ? [config.model] : []);
  const [model, setModel] = useState(config?.model ?? "");
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const [origin, setOrigin] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
    return () => controller.current?.abort();
  }, []);
  const run = async (connect: boolean) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]);
    setChecking(true);
    setStatus("");
    onConfig(null);
    try {
      if (connect) {
        await checkLocalModel({ endpoint, model }, signal);
        if (abort.signal.aborted) return;
        onConfig({ endpoint, model });
        setStatus("Local model verified. Requests run on this device.");
      } else {
        const found = await listLocalModels(endpoint, signal);
        if (abort.signal.aborted) return;
        setModels(found);
        setModel(found[0] ?? "");
        setStatus(
          found.length
            ? "Choose a model, then connect."
            : "No downloaded chat models found. Install a local model in Ollama first. Cloud models are excluded.",
        );
      }
    } catch (error) {
      if (!abort.signal.aborted)
        setStatus(
          signal.aborted
            ? "Local connection timed out. Check Ollama and retry."
            : error instanceof Error
              ? error.message
              : "Could not connect to local Ollama.",
        );
    } finally {
      if (!abort.signal.aborted) setChecking(false);
    }
  };
  return (
    <div className="mt-2 space-y-2 rounded border border-sidebar-border p-2 text-xs">
      <label className="block">
        Ollama address
        <input
          aria-label="Ollama address"
          value={endpoint}
          disabled={disabled || checking}
          onChange={(e) => {
            setEndpoint(e.target.value);
            setModels([]);
            setModel("");
            setStatus("");
            onConfig(null);
          }}
          className="mt-1 w-full rounded border border-sidebar-border bg-sidebar p-2"
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || checking}
        onClick={() => void run(false)}
      >
        Find local models
      </Button>
      {models.length > 0 && (
        <>
          <label className="block">
            Downloaded model
            <select
              aria-label="Downloaded model"
              value={model}
              disabled={disabled || checking}
              onChange={(e) => {
                setModel(e.target.value);
                onConfig(null);
                setStatus("");
              }}
              className="mt-1 w-full rounded border border-sidebar-border bg-sidebar p-2"
            >
              {models.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || checking || !model}
            onClick={() => void run(true)}
          >
            {config ? "Reconnect local model" : "Connect local model"}
          </Button>
        </>
      )}
      <p role="status" className="break-words text-sidebar-foreground/70">
        {checking
          ? "Checking local Ollama…"
          : status ||
            (config
              ? `Connected: ${config.model}`
              : "Not connected. Local tools are ready without setup.")}
      </p>
      <details>
        <summary className="cursor-pointer">Local AI setup</summary>
        <div className="mt-2 space-y-2 text-sidebar-foreground/70">
          <p>
            Install Ollama and download a chat model that fits your device. Disable cloud features
            and allow this site's exact origin, then restart Ollama:
          </p>
          <code className="block break-all">
            OLLAMA_NO_CLOUD=1
            <br />
            OLLAMA_ORIGINS={origin || "your site origin"}
          </code>
          <p>
            Keep Ollama bound to loopback. Allow browser local-network access if asked. Hosted
            browsers may restrict local connections; run the app locally if needed.
          </p>
          <p>
            Inference uses your device's memory and compute. No provider credits or API key are
            needed for downloaded models. Quality depends on the chosen model.
          </p>
          <a
            className="underline"
            href="https://docs.ollama.com/faq"
            target="_blank"
            rel="noreferrer"
          >
            Ollama setup instructions
          </a>
        </div>
      </details>
    </div>
  );
}
