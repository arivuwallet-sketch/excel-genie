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
- npm run test:integration: import/export integration tests, Bun with dependencies.
- npm run typecheck and npm run build: TypeScript and production build checks.
- GitHub Actions runs these against the existing frozen lockfile.

Before release, smoke-test upload → Ask → Build → preview → Apply → Undo → export in the Lovable preview, at desktop and phone widths, with the AI gateway configured. Live AI, Power BI, browser rendering and deployment require separate verification.
