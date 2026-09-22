# Excel Genie

Create a modern, full-stack, web-based AI-Powered Microsoft Excel Analyzer, Builder & Editor. The application should allow users to process, edit, analyze, or generate spreadsheets using natural language prompts, raw context, or uploaded files.

1. Core Features & Capabilities

Prompt-Based Actions: Users can create new spreadsheets from scratch, edit existing sheets, or analyze data simply by typing natural language prompts.

File Operations & Export: Process uploaded files and generate downloadable Excel output (.xlsx, .csv) containing all processed formulas, data, and styles.

Complex Excel Engineering: Handle tasks ranging from basic data entry to advanced finance/accounting operations (e.g., Bank/Reconciliation, Electronic Funds Transfer (EFT) logs, variance analysis, financial modeling, and auditing).

2. Supported File Formats & Input Handling

Full Import Support: Build file-parsing capabilities (using libraries like SheetJS/XLSX, PapaParse, or PDF.js) to accept the following inputs:

Excel Formats: .xlsx, .xlsm, .xlsb, .xltx, .xltm, .xls, .xlt, .xml, .xlam, .xla, .xlw, .xlr

Text/Delimited Formats: .prn, .txt, .csv, .dif, .slk

Database & Open Standard: .dbf, .ods, .pdf, .xps

Clipboard Inputs: Plain text, HTML tables, RTF, tab-delimited text, and bitmap image data pasted directly into the app.

Explicit Handling for Unsupported Formats: Show a friendly error/conversion toast if users upload legacy unsupported formats (.xlc, .wk1–.wk4, .wks, .fmt, .fm3, .wq1, .wb1, .wb3).

3. Built-In Excel Knowledge Base & Capabilities The AI engine must possess deep domain expertise across all Microsoft Excel levels:

Fundamentals & Data Manipulation: Data entry, cell editing, worksheet modification, basic/advanced formatting, conditional formatting, printing setups, templates, and inserting shapes/images.

Formulas & Functions: Mastery over Basic, Text-based, Conditional (SUMIFS, COUNTIFS), Lookup (XLOOKUP, INDEX/MATCH, VLOOKUP), and modern Office 365 functions (LET, LAMBDA, FILTER, UNIQUE, SORT).

Data Management & Analytics: Data validation rules, list functions, PivotTables, Power Query/PowerPivot concepts, handling large datasets, "What-If" Analysis (Data Tables, Goal Seek, Scenario Manager), and formula auditing.

Macros & Automation: Ability to read, parse, generate, and explain Excel VBA/Macro code, including worksheet/workbook protection configurations.

4. User Interface & Layout

Dashboard Header: App title, file upload drop-zone, export button (Download .xlsx), and model selector/status indicator.

Interactive Spreadsheet Canvas: An interactive grid component (e.g., Handsontable, AG Grid, or Luckysheet) displaying the active worksheet data with tabs for multiple sheets.

AI Chat & Command Sidebar: A side panel where users can type instructions, run pre-built prompts (e.g., "Reconcile Sheet A and Sheet B", "Clean white space & format currency", "Create PivotTable summary"), view audit logs, and inspect generated formulas or VBA scripts.

5. Design & User Experience

Clean, professional UI using modern green and neutral charcoal accents (Excel-inspired palette).

Drag-and-drop file upload zone supporting all listed formats.

Real-time loading states, formula syntax highlighting, and visual toast notifications for processing steps.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8ad4c337-bb40-44a7-aeea-f85ca8da9171).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
