# ExcelGPT

ExcelGPT helps users reduce repetitive spreadsheet work: import data, review changes, reconcile sources, build summaries, calculate supported formulas and export Excel workbooks.

## Working features

- Excel, CSV, ODS and supported text-table imports; multiple sources and an **Add files** action.
- Editable grid, formula bar, multi-cell paste, search, undo/redo and reviewed change proposals.
- Seven local workflows: reconciliation, lookup joins, consolidation, find/replace, text splitting, percentage stress scenarios and labelled synthetic test data.
- A bounded calculation worker with 35 supported scalar functions, explicit errors and reviewed values copies. Original formulas remain intact.
- Full-data profiles, cleaning, duplicate removal, deterministic pivot summaries and dashboard previews.
- 50 workbook templates, including finance, institutional and operations examples.
- A default local command assistant for summaries, audits, cleaning and grouped totals, with no API key, provider credits or daily request quota.
- Optional on-device AI through Ollama, plus explicit paid GPT-6 Astra Max and Lovable AI connections. Every response identifies its engine; edits always require review.
- Formula-preserving XLSX exports, styled XLSX exports, CSV, optional device recovery and JSON backups.
- An outbound Power BI connector for values-only data with tenant credentials.

[UPGRADE.md](./UPGRADE.md) documents the exact limits, calculation semantics, verification and outstanding parts of the product specification. Original workbook formatting, macros, charts, named ranges and other Excel objects are not preserved by the string-grid data model. PDF/OCR, full Excel formula compatibility, real-time collaboration and enterprise identity/compliance features are not implemented.

## Development

Use Node.js 24 and Bun for the committed dependency lockfile.

```sh
bun install --frozen-lockfile
npm run dev
```

```sh
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

CI runs the same checks and installs Chromium with its Linux dependencies. Browser tests cover uploads, reconciliation, review/apply/undo, downloads, worker calculation and mobile interactions. Unit tests check calculation baselines and AI response/error contracts without spending provider credits.

## No-credit operation

The assistant opens in **Local tools** on every page load. Import a workbook and try **Summarize this sheet**, **Audit my formulas**, **Trim whitespace**, **Remove duplicate rows**, `Sum "Amount" by "Category"`, or `Count rows by "Category"`. Use your column headers. Summaries and grouped totals scan the full data, treating row 1 as headers; numeric statistics exclude formulas and identifier-like numbers. Commands operate on the selected sheet; audits cover the workbook. Unsupported or compound requests receive guidance without partial edits.

Templates, Workflows, Calculate, editing and exports also run without provider credentials. There is no artificial daily quota on local tools, but device memory, workbook size and calculation limits still apply. This is not unlimited compute or full Excel compatibility. The hosted app must first load over the network; offline PWA installation is not implemented.

For open-ended natural-language work, choose **Local AI · Ollama**:

1. Install [Ollama](https://docs.ollama.com/quickstart) on the same device as your browser and download a local chat model that fits its memory. ExcelGPT never downloads model weights automatically.
2. Set `OLLAMA_NO_CLOUD=1` and `OLLAMA_ORIGINS` to your exact app origin, such as `https://excel-composer-ai.lovable.app` or `http://127.0.0.1:5173`, then restart Ollama. Follow the [platform-specific environment instructions](https://docs.ollama.com/faq). Keep its default loopback binding; do not expose an unauthenticated Ollama server publicly.
3. In ExcelGPT, use **Find local models**, choose a downloaded model, and **Connect local model**. Allow browser local-network access if prompted. If the browser blocks a hosted page from reaching loopback, run ExcelGPT locally.
4. Send a request and review its proposal before applying. Stop aborts the local browser request.

The browser calls the device's loopback API directly, without server credentials. Only downloaded GGUF text models with local model metadata are accepted; cloud model names and remote aliases are rejected. Metadata is rechecked before each request. Local AI never falls back to a cloud provider. Disable Ollama Cloud as above to enforce local-only execution in Ollama itself. Model quality and speed depend on hardware and the selected weights. Context is sampled and conservatively bounded (up to 32K context, up to 4K generated tokens); requests that exceed the safe context budget fail explicitly. One invalid-proposal repair is permitted; failures never silently apply edits.

## Optional paid providers

Choosing a cloud engine is explicit and is never automatic. These options are not required for local tools or local AI.

- **GPT-6 Astra · Max** uses the official OpenAI Responses API with `model: "gpt-6-astra"` and `reasoning: { effort: "max" }`, JSON output, and `store: false`. Configure `OPENAI_API_KEY` only on the server. This exact model has no fallback, and provider access, credits and rate limits still apply. See [the official model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra). No free or unlimited Astra access is claimed.
- **Lovable AI** uses the existing gateway. Enable the AI connector in the [Lovable project](https://lovable.dev/projects/8ad4c337-bb40-44a7-aeea-f85ca8da9171) and configure server-side `LOVABLE_API_KEY`. Optional `EXCEL_AI_FAST_MODEL` and `EXCEL_AI_REASONING_MODEL` override its existing defaults.

The status check reports key presence, not verified model access. AI sends bounded workbook samples, profiles and recent chat to the selected provider; large-workbook answers may not be exhaustive. Static validation protects edit structure and references but does not prove an AI-generated answer correct. Astra requests and their one possible proposal-repair attempt share a five-minute deadline; Lovable uses two minutes. Hosting timeouts can be shorter. Stopping a cloud response discards it locally; its server request may continue and incur charges.

Power BI configuration is documented in [the connector](./src/lib/powerbi.server.ts). Add hosting authentication and persistent usage controls before offering public paid AI access. Unit/protocol and browser-mock tests do not substitute for live provider acceptance checks; this release was built without an OpenAI/Lovable key or a running Ollama model.

## Publishing

This repository is connected to Lovable. Commits pushed to `main` sync to the editor; republish in Lovable to update the public site. Preserve published Git history. Verify the deployed no-credit flows after publishing. Optional AI providers require separate live checks with the intended runtime or authorized account.
