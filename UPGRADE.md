# Workbook intelligence upgrade

SheetSmith keeps its existing templates, dashboards and Power BI integration and adds:

- Ask mode for read-only answers; Build/edit mode for proposed operations.
- Cell-by-cell previews, Apply/Discard and stale-proposal protection. Failed operation batches roll back completely.
- Full-sheet data profiles, missing/duplicate counts, IQR outlier indicators, whitespace cleanup, deduplication, empty-row removal and deterministic pivot summaries.
- A formula bar, searchable paginated grid, multi-cell paste and mobile-accessible chat.
- Opt-in local recovery plus JSON workbook/chat backup and restore.
- Formula-preserving imports, numeric XLSX exports, preserved leading-zero identifiers and formula-escaped CSV output.
- Read-only formula auditing, direct/range self-reference detection and iterative dependency traversal.

## Limits and semantics

Profiles treat row 1 as headers and omit blank rows. Formula results are not evaluated or included in numeric summaries. Pivot outputs are ordinary static summary sheets, not native Excel PivotTables. Structural row changes and sheet renames on formula workbooks are blocked until formula-reference translation exists.

Limits: 30 sheets, 10,000 rows/sheet, 256 columns/sheet, 250,000 cells/workbook, 10,000 characters/cell and 20 MB/input file. The input-size cap is not a decompression sandbox. Importing original workbook formatting, charts, named ranges, validation and macros is not supported by the existing string-grid model.

AI context contains bounded row samples, profiles and explicit coverage. Large-workbook answers are not guaranteed exhaustive. Static auditing is not an Excel calculation engine and does not prove a financial model correct. Generated VBA is text only. PDF/XPS and image OCR are not implemented; convert to XLSX/CSV first. The old printable-byte PDF extraction was removed from supported inputs.

Stop discards a pending response on the client; the server call can continue until its timeout. Each attempt has a 90-second timeout, with at most one response repair. Restore and imports are undoable for workbook data; chat restore replaces the current chat.

## Configuration

Keep LOVABLE_API_KEY server-side. Optional EXCEL_AI_FAST_MODEL and EXCEL_AI_REASONING_MODEL override the existing gateway defaults. Confirm model availability in the Lovable account. Host authentication and cost/abuse controls remain required for a public paid-AI endpoint; no new account system is introduced here.

## Verification and release

- npm test: dependency-free regression suite, Node 24.
- npm run test:integration: import/export integration tests, Node 24 with dependencies.
- npm run typecheck and npm run build: TypeScript and production build checks.
- GitHub Actions runs these against the existing frozen lockfile.

Before release, smoke-test upload → Ask → Build → preview → Apply → Undo → export in the Lovable preview, at desktop and phone widths, with the AI gateway configured. Live AI, Power BI, browser rendering and deployment require separate verification.

## September 25 reliability upgrade

- Formula-only cells now survive XLSX export and re-import, even without cached results. Numeric imports keep their underlying precision; long identifiers, zero-padded identifiers, empty sheets and blank clipboard rows are preserved.
- Static audits understand lowercase/reversed references and cycles through cross-sheet ranges. Expensive dependency scans stop at a documented work budget and report incomplete coverage. Potential spill conflicts are warnings, not claims of evaluated results.
- Sheet deletion rejects dependent formulas. Scenario and depreciation controls target recognized driver cells, use the template's expected values, and disable unavailable controls. Fractional rates display correctly as percentages.
- Power BI uses row one as headers, preserves the first data record, generates unique names, preserves mixed text/numeric columns, and rejects unevaluated formulas. Existing dataset schemas are checked before clearing rows. Clear failures stop the push; API calls time out after 30 seconds. Multi-table replacement is not transactional: a later network failure can leave partial updates. Live tenant validation is still needed.
- The AI prompt prefers compatible modern Excel functions and explains external-service requirements. The insights panel lists modern/connected functions found in the active sheet. These are compatibility notices, not a new calculation engine.
- All 46 template builders now have structural regression tests. Tests run with Node 24; Bun remains the locked dependency installer in CI. Lint is included in CI.

### Status of the attached product specification

| Area                                                                                | Current behavior / remaining work                                                                                                                         |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Natural-language analysis and reviewed edits                                        | Implemented; requires server-side LOVABLE_API_KEY and an available gateway model. Live requests were not tested without credentials.                      |
| Import, editing, recovery, XLSX/CSV exports                                         | Implemented within the documented limits. Original formatting, macros, named ranges and Excel objects are not retained by the string-grid representation. |
| Financial, quantitative, institutional and dashboard library                        | 46 preset builders. Structural tests do not certify financial accuracy; formulas recalculate in Excel.                                                    |
| Modern dynamic-array and regex formulas                                             | Formula text can be generated/exported; Excel version support is required. No browser formula evaluation.                                                 |
| PY, COPILOT, GPT-family formulas                                                    | Compatibility notices and generation guidance only. Native execution, Python objects and add-in provisioning are not implemented.                         |
| VBA, Power Query, native charts, slicers, pivots, controls and Sheet Views          | Some templates contain instructions/formulas. Compiled macros, embedded queries, native Excel object generation and execution remain unimplemented.       |
| Power BI                                                                            | Outbound push connector; needs tenant credentials and a values-only workbook. Governed semantic-model grounding is not implemented.                       |
| PDF/XPS, OCR and rich clipboard conversion                                          | Not implemented; use a supported spreadsheet/text format.                                                                                                 |
| Spreadsheet-to-app publishing, embeds, domains and external forms                   | Not implemented; requires a separate publishing/authentication architecture.                                                                              |
| Healthcare, energy, EPC and defense-specific workflows                              | Not implemented as dedicated validated modules.                                                                                                           |
| Multi-user collaboration, RBAC, SOX/SOC compliance and immutable audit trails       | Not implemented. Local undo/recovery is not an immutable or multi-user audit system.                                                                      |
| Cryptographic signing, materiality alerts, synthetic data and adversarial scenarios | Not implemented as platform modules. Existing quantitative/scenario templates are limited examples.                                                       |
| Offline PWA/WASM calculations, IndexedDB synchronization and conflict resolution    | Not implemented. Optional localStorage recovery works on the current device; AI still requires connectivity.                                              |

No claim is made that every item in the product specification is complete or that the app is error-free. End-to-end browser testing, live AI/Power BI calls, and spreadsheet recalculation in Excel remain release checks.
