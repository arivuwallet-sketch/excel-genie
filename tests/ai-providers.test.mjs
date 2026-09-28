import { test } from "node:test";
import assert from "node:assert/strict";
import { completeAstra } from "../src/lib/openai-astra.server.ts";
import {
  checkLocalModel,
  listLocalModels,
  localEndpoint,
  runLocalAi,
} from "../src/lib/local-ai.ts";
import { classifyAgentError } from "../src/lib/agent-core.ts";
const json = (data) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const metadata = {
  details: { format: "gguf" },
  capabilities: ["completion"],
  model_info: { "general.architecture": "test", "test.context_length": 32768 },
};
const config = { endpoint: "http://127.0.0.1:11434", model: "local-test:latest" };
const request = {
  prompt: "Change amount to 25",
  sheets: [{ name: "Data", rows: [["Amount"], ["10"]] }],
  history: [],
  mode: "edit",
  activeSheet: "Data",
};
const signal = () => AbortSignal.timeout(10000);
const proposal = {
  reply: "Proposed change",
  operations: [{ op: "set_cells", sheet: "Data", cells: [{ a1: "A2", value: "25" }] }],
};

test("Astra uses exact Responses model and max reasoning without fallbacks or client keys", async () => {
  let calls = 0;
  const result = await completeAstra(
    { key: "server-test-key", system: "Return JSON", prompt: "Task", signal: signal() },
    async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(init.body);
      assert.equal(body.model, "gpt-6-astra");
      assert.deepEqual(body.reasoning, { effort: "max" });
      assert.deepEqual(body.text, { format: { type: "json_object" } });
      assert.equal(body.store, false);
      assert.equal(init.headers.Authorization, "Bearer server-test-key");
      assert.equal(init.redirect, "error");
      assert.ok(!("temperature" in body));
      return json({
        status: "completed",
        model: "gpt-6-astra",
        output: [
          { type: "reasoning", content: [{ type: "summary_text", text: "internal" }] },
          { type: "message", content: [{ type: "output_text", text: '{"reply":"Ready"}' }] },
        ],
      });
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.text, '{"reply":"Ready"}');
});
test("Astra handles output exhaustion, refusals, wrong models and incomplete responses", async () => {
  const opts = { key: "test", system: "JSON", prompt: "Task", signal: signal() };
  assert.equal(
    (
      await completeAstra(opts, async () =>
        json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
      )
    ).finishReason,
    "length",
  );
  for (const response of [
    { status: "failed" },
    { status: "completed", model: "other" },
    {
      status: "completed",
      model: "gpt-6-astra",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    },
  ])
    await assert.rejects(completeAstra(opts, async () => json(response)));
});
test("Astra provider errors preserve safe classification and do not retry or leak response bodies", async () => {
  for (const status of [401, 402, 429, 503]) {
    let calls = 0;
    await assert.rejects(
      completeAstra({ key: "test", system: "JSON", prompt: "Task", signal: signal() }, async () => {
        calls++;
        return new Response("private provider data", { status });
      }),
      (error) => {
        assert.equal(error.statusCode, status);
        assert.ok(!classifyAgentError(error).message.includes("private"));
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
test("local endpoints are restricted to loopback without paths, credentials or redirects", () => {
  for (const address of [
    "https://ollama.com",
    "http://localhost.evil.test",
    "http://user:pass@localhost:11434",
    "file:///etc/passwd",
    "http://127.0.0.1:11434/api",
    "http://localhost:11434?secret=1",
    "http://192.168.1.10:11434",
  ])
    assert.throws(() => localEndpoint(address));
  assert.equal(localEndpoint("http://127.0.0.1:11434/"), config.endpoint);
  assert.equal(localEndpoint("http://[::1]:11434"), "http://[::1]:11434");
});
test("discovery filters out cloud, unknown and embedding-only models at verification", async () => {
  const models = await listLocalModels(config.endpoint, signal(), async () =>
    json({
      models: [
        { name: "local:latest", size: 100, details: { format: "gguf" } },
        { name: "remote:cloud", size: 100, details: { format: "gguf" } },
        {
          name: "alias",
          size: 100,
          details: { format: "gguf" },
          remote_host: "https://ollama.com",
        },
        { name: "unknown", size: 1 },
      ],
    }),
  );
  assert.deepEqual(models, ["local:latest"]);
  await assert.rejects(
    checkLocalModel(config, signal(), async () =>
      json({ ...metadata, capabilities: ["embedding"] }),
    ),
    /cannot generate/,
  );
});
test("local AI verifies weights before sending workbook data and produces only a reviewed proposal", async () => {
  const calls = [];
  const result = await runLocalAi(request, config, signal(), async (url, init) => {
    calls.push(url);
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.ok(!init.headers?.Authorization);
    const body = JSON.parse(init.body);
    if (url.endsWith("/show")) {
      assert.ok(!("messages" in body));
      return json(metadata);
    }
    assert.equal(body.model, config.model);
    assert.equal(body.stream, false);
    assert.equal(body.format, "json");
    assert.equal(body.options.num_ctx, 32768);
    assert.match(body.messages[1].content, /WORKBOOK DATA/);
    return json({
      model: config.model,
      done: true,
      done_reason: "stop",
      message: { content: JSON.stringify(proposal) },
    });
  });
  assert.deepEqual(calls, [`${config.endpoint}/api/show`, `${config.endpoint}/api/chat`]);
  assert.equal(result.sheets[0].rows[1][0], "25");
  assert.equal(request.sheets[0].rows[1][0], "10");
  assert.equal(result.model, `Local AI · ${config.model}`);
});
test("remote aliases and unverified weights cannot receive workbook context", async () => {
  for (const response of [
    { ...metadata, remote_host: "https://ollama.com" },
    { ...metadata, remote_model: "paid-model" },
    { capabilities: ["completion"] },
  ]) {
    let calls = 0;
    await assert.rejects(
      runLocalAi(request, config, signal(), async (url) => {
        calls++;
        assert.ok(url.endsWith("/show"));
        return json(response);
      }),
      /verify downloaded/,
    );
    assert.equal(calls, 1);
  }
});
test("cancellation prevents local requests and never calls a cloud fallback", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    runLocalAi(request, config, controller.signal, async () => {
      calls++;
      return json(metadata);
    }),
  );
  assert.equal(calls, 0);
});
test("unsafe local AI edits and Ask edits never become accepted proposals", async () => {
  for (const data of [{ ...request, mode: "ask" }, request]) {
    let chats = 0;
    const unsafe =
      data.mode === "ask"
        ? proposal
        : {
            ...proposal,
            operations: [
              {
                op: "set_cells",
                sheet: "Data",
                cells: [{ a1: "A2", value: '=WEBSERVICE("https://invalid")' }],
              },
            ],
          };
    await assert.rejects(
      runLocalAi(data, config, signal(), async (url) =>
        url.endsWith("/show")
          ? json(metadata)
          : (chats++,
            json({
              model: config.model,
              done: true,
              message: { content: JSON.stringify(unsafe) },
            })),
      ),
    );
    assert.equal(chats, 2);
    assert.equal(request.sheets[0].rows[1][0], "10");
  }
});
test("small local model context is rejected before workbook transmission or silent truncation", async () => {
  let calls = 0;
  await assert.rejects(
    runLocalAi(request, config, signal(), async () => {
      calls++;
      return json({
        ...metadata,
        model_info: { "general.architecture": "test", "test.context_length": 2048 },
      });
    }),
    /safe context budget/,
  );
  assert.equal(calls, 1);
});

test("Stop aborts an in-flight local generation without retries", async () => {
  const controller = new AbortController();
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let chats = 0;
  const pending = runLocalAi(request, config, controller.signal, async (url, init) => {
    if (url.endsWith("/show")) return json(metadata);
    chats++;
    entered();
    return new Promise((resolve, reject) =>
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }),
    );
  });
  await started;
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(chats, 1);
  assert.equal(request.sheets[0].rows[1][0], "10");
});
