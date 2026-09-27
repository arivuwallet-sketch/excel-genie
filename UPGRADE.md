# Workbook intelligence upgrade

ExcelGPT keeps its existing templates, dashboards and Power BI integration and adds:

- Ask mode for read-only answers; Build/edit mode for proposed operations.
- Cell-by-cell previews, Apply/Discard and stale-proposal protection. Failed operation batches roll back completely.
- Full-sheet data profiles, missing/duplicate counts, IQR outlier indicators, whitespace cleanup, deduplication, empty-row removal and deterministic pivot summaries.
- A formula bar, searchable paginated grid, multi-cell paste and mobile-accessible chat.
- Opt-in local recovery plus JSON workbook/chat backup and restore.
- Formula-preserving imports, numeric XLSX exports, preserved leading-zero identifiers and formula-escaped CSV output.
- Read-only formula auditing, direct/range self-reference detection and iterative dependency traversal.

## Limits and semantics

Profiles treat row 1 as headers and omit blank rows. Formula results are excluded from raw-data profiles. Use Calculate to preview supported formulas and create a reviewed values copy for analysis. Pivot outputs are ordinary static summary sheets, not native Excel PivotTables. Structural row changes and sheet renames on formula workbooks are blocked until formula-reference translation exists.

Limits: 30 sheets, 10,000 rows/sheet, 256 columns/sheet, 250,000 cells/workbook, 10,000 characters/cell and 20 MB/input file. The input-size cap is not a decompression sandbox. Importing original workbook formatting, charts, named ranges, validation and macros is not supported by the existing string-grid model.

AI context contains bounded row samples, profiles and explicit coverage. Large-workbook answers are not guaranteed exhaustive. Static auditing is not an Excel calculation engine and does not prove a financial model correct. Generated VBA is text only. PDF/XPS and image OCR are not implemented; convert to XLSX/CSV first. The old printable-byte PDF extraction was removed from supported inputs.

Stop discards a pending response on the client; the server call can continue until its timeout. AI generation and at most one response repair share a 120-second deadline. Provider failures are not retried as invalid JSON. Restore and imports are undoable for workbook data; chat restore replaces the current chat.

## Configuration

Keep LOVABLE_API_KEY server-side. Optional EXCEL_AI_FAST_MODEL and EXCEL_AI_REASONING_MODEL override the existing gateway defaults. Confirm model availability in the Lovable account. Host authentication and cost/abuse controls remain required for a public paid-AI endpoint; no new account system is introduced here.

## Verification and release

- npm test: workbook, AI contract, workflow and calculation regression suite, Node 24.
- npm run test:integration: import/export integration tests, Node 24 with dependencies.
- npm run typecheck and npm run build: TypeScript and production build checks.
- GitHub Actions runs these against the existing frozen lockfile.

Before release, smoke-test upload → Ask → Build → preview → Apply → Undo → export in the Lovable preview, at desktop and phone widths, with the AI gateway configured. Live AI, Power BI and deployment require separate verification. Automated browser tests cover local desktop/mobile workflows.

## September 25 reliability upgrade

- Formula-only cells now survive XLSX export and re-import, even without cached results. Numeric imports keep their underlying precision; long identifiers, zero-padded identifiers, empty sheets and blank clipboard rows are preserved.
- Static audits understand lowercase/reversed references and cycles through cross-sheet ranges. Expensive dependency scans stop at a documented work budget and report incomplete coverage. Potential spill conflicts are warnings, not claims of evaluated results.
- Sheet deletion rejects dependent formulas. Scenario and depreciation controls target recognized driver cells, use the template's expected values, and disable unavailable controls. Fractional rates display correctly as percentages.
- Power BI uses row one as headers, preserves the first data record, generates unique names, preserves mixed text/numeric columns, and rejects unevaluated formulas. Existing dataset schemas are checked before clearing rows. Clear failures stop the push; API calls time out after 30 seconds. Multi-table replacement is not transactional: a later network failure can leave partial updates. Live tenant validation is still needed.
- The AI prompt prefers compatible modern Excel functions and explains external-service requirements. The insights panel lists modern/connected functions found in the active sheet. These are compatibility notices, not a new calculation engine.
- All 46 template builders now have structural regression tests. Tests run with Node 24; Bun remains the locked dependency installer in CI. Lint is included in CI.

### Status of the attached product specification

| Area                                                                                | Current behavior / remaining work                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Natural-language analysis and reviewed edits                                        | Implemented; requires server-side LOVABLE_API_KEY and an available gateway model. Live requests were not tested without credentials.                                                 |
| Import, editing, recovery, XLSX/CSV exports                                         | Implemented within the documented limits. Original formatting, macros, named ranges and Excel objects are not retained by the string-grid representation.                            |
| Financial, quantitative, institutional and dashboard library                        | 50 preset builders. Structural tests do not certify financial accuracy; formulas recalculate in Excel.                                                                               |
| Modern dynamic-array and regex formulas                                             | Formula text can be generated/exported; Excel version support is required. Local calculation supports an explicit scalar-function subset; dynamic arrays require Excel.              |
| PY, COPILOT, GPT-family formulas                                                    | Compatibility notices and generation guidance only. Native execution, Python objects and add-in provisioning are not implemented.                                                    |
| VBA, Power Query, native charts, slicers, pivots, controls and Sheet Views          | Some templates contain instructions/formulas. Compiled macros, embedded queries, native Excel object generation and execution remain unimplemented.                                  |
| Power BI                                                                            | Outbound push connector; needs tenant credentials and a values-only workbook. Governed semantic-model grounding is not implemented.                                                  |
| PDF/XPS, OCR and rich clipboard conversion                                          | Not implemented; use a supported spreadsheet/text format.                                                                                                                            |
| Spreadsheet-to-app publishing, embeds, domains and external forms                   | Not implemented; requires a separate publishing/authentication architecture.                                                                                                         |
| Healthcare, energy, EPC and defense-specific workflows                              | Four example-based operations templates cover clinic capacity, renewable generation, construction earned value and bid costing. They are not regulatory or domain-certified modules. |
| Multi-user collaboration, RBAC, SOX/SOC compliance and immutable audit trails       | Not implemented. Local undo/recovery is not an immutable or multi-user audit system.                                                                                                 |
| Cryptographic signing, materiality alerts, synthetic data and adversarial scenarios | Seeded synthetic transactions and percentage stress scenarios are implemented. Signing, immutable audit and materiality alerts remain unimplemented.                                 |
| Offline PWA/WASM calculations, IndexedDB synchronization and conflict resolution    | Not implemented. Optional localStorage recovery works on the current device; AI still requires connectivity.                                                                         |

No claim is made that every item in the product specification is complete or that the app is error-free. Live AI/Power BI calls and advanced spreadsheet recalculation in Excel remain deployment checks. Browser regression tests run in CI.

## September 27 ExcelGPT workflow release

- Fixed the empty-workbook reconciliation path: source requirements are checked locally before calling AI. The reconciliation quick action opens the guided local workflow.
- AI gateway requests send both supported authorization headers. Configuration, authentication, credit, rate-limit, service and timeout failures have distinct messages and request IDs. Diagnostics never return the provider key or raw provider response. JSON repair happens only for invalid proposals, with one repair attempt; scalar numeric/boolean/null cells normalize safely. Ask mode can accept prose and cannot mutate a workbook.
- Seven reviewed local workflows: reconciliation with tolerance and duplicate-key flags; exact-key lookup joins; consolidation aligned by headings and source row; literal find/replace; text splitting; percentage stress scenarios; seeded, explicitly labelled synthetic test data. No workbook is changed until Apply. Table workflows reject unevaluated formulas and data beyond missing headings.
- Add files imports multiple sources into the current workbook. Values-only sheet-name collisions get unique names. Formula-bearing conflicts are rejected to avoid changing cross-sheet references. Imports that finish after newer edits cannot overwrite those edits when appending.
- Calculate runs an explicit 35-function scalar subset in a terminable worker. Arithmetic, comparisons, concatenation, quoted/absolute/cross-sheet references, lazy IF/IFERROR, aggregates, conditional sums/counts, exact lookups, rounding and text functions are supported. It has a one-million-cell work budget, depth/token limits and a 10-second worker deadline. Cycles, oversized ranges and unsupported formulas produce explicit errors; original formulas remain intact. Values copies require no unresolved errors in the selected sheet. Named ranges, structured references, full-column ranges, date functions, dynamic arrays, approximate lookups and connected functions still require Excel. This is a bounded preview, not full Excel parity.
- Four additional operations templates include labelled example inputs and baseline calculation tests: clinic capacity, renewable generation, construction earned value and proposal costing. Replace examples with verified inputs. Templates are not domain certifications.
- Disabled inputs until client initialization completes so early typing and uploads cannot be lost during hydration.
- Fixed a template-generation race that could submit the previous workbook to AI. Matched templates load locally; AI extension is a separate user action after loading.
- `npm run test:e2e` exercises actual CSV upload, reconciliation, preview/apply/undo, XLSX download, worker calculation, values copies, unsupported-formula blocking and mobile workflows. CI installs Chromium and retains traces on failure.

Deployment: pushing the connected branch updates the Lovable editor. Republish the app in Lovable to update the public URL, then verify a live request with the deployment's configured AI connector and credits. The configuration badge checks whether a server key is present; it does not certify provider availability. Host authentication, persistent user quotas, multi-user storage and security/compliance reviews remain necessary for a public paid production service.
