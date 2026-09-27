# ExcelGPT

ExcelGPT helps users reduce repetitive spreadsheet work: import data, review changes, reconcile sources, build summaries, calculate supported formulas and export Excel workbooks.

## Working features

- Excel, CSV, ODS and supported text-table imports; multiple sources and an **Add files** action.
- Editable grid, formula bar, multi-cell paste, search, undo/redo and reviewed change proposals.
- Seven local workflows: reconciliation, lookup joins, consolidation, find/replace, text splitting, percentage stress scenarios and labelled synthetic test data.
- A bounded calculation worker with 35 supported scalar functions, explicit errors and reviewed values copies. Original formulas remain intact.
- Full-data profiles, cleaning, duplicate removal, deterministic pivot summaries and dashboard previews.
- 50 workbook templates, including finance, institutional and operations examples.
- AI read-only answers and proposed edits through Lovable AI, with configuration status and actionable connection errors.
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

## Server configuration

Enable the AI connector in the [Lovable project](https://lovable.dev/projects/8ad4c337-bb40-44a7-aeea-f85ca8da9171) and ensure the published deployment has `LOVABLE_API_KEY`. Keep it server-side. Optional `EXCEL_AI_FAST_MODEL` and `EXCEL_AI_REASONING_MODEL` override the gateway defaults. A configured badge only means a key is present; provider availability and credits still require a live check.

Local workflows, calculations and templates work without AI credentials. AI requests send bounded workbook samples and profiles to the provider; large-workbook answers may not be exhaustive. All AI edits require review before applying.

Power BI configuration is documented in [the connector](./src/lib/powerbi.server.ts). Add hosting authentication and persistent usage controls before offering public paid AI access.

## Publishing

This repository is connected to Lovable. Commits pushed to `main` sync to the editor; republish in Lovable to update the public site. Preserve published Git history. Verify the deployed AI connector with a live request after publishing.
