import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  LayoutTemplate,
  Plus,
  Redo2,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChangePreview, type Proposal } from "@/components/excel/ChangePreview";
import { InsightsPanel } from "@/components/excel/InsightsPanel";
import { validateWorkbook, MAX_ROWS, MAX_COLS } from "@/lib/workbook-limits";
import { workbookDiff } from "@/lib/workbook-intelligence";
import { WORKSPACE_KEY, parseWorkspace, downloadWorkspace, type Workspace } from "@/lib/workspace-storage";
import { ChatPanel, type ChatMessage } from "@/components/excel/ChatPanel";
import { DashboardHub } from "@/components/excel/DashboardHub";
import { ModelControls, findAssumptions, type Assumption } from "@/components/excel/ModelControls";
import { SheetGrid } from "@/components/excel/SheetGrid";
import { TemplateHub } from "@/components/excel/TemplateHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadStyledWorkbook } from "@/lib/excel-export";
import { runExcelAgent } from "@/lib/excel.functions";
import { auditAndRepair, type AuditIssue } from "@/lib/formula-audit";
import { pushToPowerBi } from "@/lib/powerbi.server";
import { useUndoableState } from "@/hooks/use-undoable-state";

import {
  ACCEPT_ATTR,
  downloadWorkbook,
  emptySheet,
  parseClipboard,
  parseFile,
  type Sheet,
  sanitizeSheetName,
} from "@/lib/spreadsheet";
import type { FinancialTemplate } from "@/lib/templates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SheetSmith — AI Excel Analyzer, Builder & Editor" },
      {
        name: "description",
        content:
          "Build, edit, reconcile and analyze Excel workbooks with natural language. Import 20+ spreadsheet formats and export polished .xlsx or .csv files.",
      },
      { property: "og:title", content: "SheetSmith — AI Excel Analyzer, Builder & Editor" },
      {
        property: "og:description",
        content:
          "Turn plain-English prompts into working spreadsheets: formulas, reconciliations, pivot summaries, variance analysis and VBA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [sheets, setSheets, sheetHistory] = useUndoableState<Sheet[]>([emptySheet()]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [mode, setMode] = useState<"ask" | "edit">("edit");
  const [quality, setQuality] = useState<"auto" | "fast" | "reasoning">("auto");
  const [panel, setPanel] = useState<"chat" | "insights">("chat");
  const [mobileView, setMobileView] = useState<"sheet" | "assistant">("sheet");
  const [autosave, setAutosave] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Local saving off");
  const requestId = useRef(0), busyRef = useRef(false), backupRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [formulas, setFormulas] = useState<string[]>([]);
  const [vba, setVba] = useState("");
  const [audit, setAudit] = useState<{ issues: AuditIssue[]; fixes: string[] }>({
    issues: [],
    fixes: [],
  });

  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hubOpen, setHubOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [scenario, setScenario] = useState("Base");
  const [depreciation, setDepreciation] = useState("Straight-line");
  const [highlightFormulas, setHighlightFormulas] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const runAgent = useServerFn(runExcelAgent);
  const pushPowerBi = useServerFn(pushToPowerBi);

  const assumptions = useMemo(() => findAssumptions(sheets), [sheets]);
  const liveIssues = useMemo(() => auditAndRepair(sheets).issues, [sheets]);

  const activeSheet = sheets[Math.min(activeIndex, sheets.length - 1)] ?? emptySheet();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_KEY);
      if (saved) { const workspace = parseWorkspace(saved); setSheets(workspace.sheets); setMessages(workspace.messages); setFileName(workspace.fileName); setAutosave(true); setSaveStatus("Recovered local workspace"); }
    } catch { toast.error("Could not restore the local workspace. Import a backup to recover it."); }
    setHydrated(true); return () => { requestId.current++; };
  }, [setSheets]);
  useEffect(() => {
    if (!hydrated || !autosave) return;
    const timer = window.setTimeout(() => {
      try {
        const workspace: Workspace = { version: 1, sheets, messages: messages.slice(-100), fileName, savedAt: new Date().toISOString() };
        const serialized = JSON.stringify(workspace);
        if (serialized.length > 4000000) throw new Error("Workspace too large for local storage");
        localStorage.setItem(WORKSPACE_KEY, serialized); setSaveStatus("Saved on this device");
      } catch { setSaveStatus("Save failed — download a backup"); }
    }, 800); return () => window.clearTimeout(timer);
  }, [sheets, messages, fileName, autosave, hydrated]);
  const stopRequest = () => { requestId.current++; busyRef.current = false; setBusy(false); toast.info("Response stopped. The server request may finish, but its result will not be applied."); };
  const proposeLocal = (sheet: Sheet, label: string, append = false) => {
    if (busyRef.current || proposal) return;
    if (!append && sheet.rows.length !== activeSheet.rows.length && sheets.some(sh => sh.rows.some(row => row.some(v => v.startsWith("="))))) { toast.error("Removing rows would change formula references. Use targeted edits or create a summary sheet."); return; }
    const used = new Set(sheets.map(sh => sh.name.toLowerCase()));
    const after = append ? [...sheets, { ...sheet, name: sanitizeSheetName(sheet.name, used) }] : sheets.map((sh, i) => i === activeIndex ? sheet : sh);
    try { validateWorkbook(after); } catch (e) { toast.error(e instanceof Error ? e.message : "Invalid workbook"); return; }
    setProposal({ before: sheets, after, label }); setMobileView("sheet");
  };

  const loadSheets = useCallback(
    (next: Sheet[], label: string) => {
      validateWorkbook(next);
      const report = auditAndRepair(next);
      setSheets(report.sheets);
      setActiveIndex(0);
      setFileName(label);
      setAudit({ issues: report.issues, fixes: report.fixes });
      toast.success(`Loaded ${next.length} sheet${next.length > 1 ? "s" : ""} from ${label}`);
    },
    [setSheets],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      const id = toast.loading(`Parsing ${list[0]?.name ?? "file"}…`);
      try {
        const parsed: Sheet[] = [];
        for (const file of list) {
          const s = await parseFile(file);
          parsed.push(...s.map((sh) => ({ ...sh, name: sh.name.slice(0, 31) })));
        }
        toast.dismiss(id);
        loadSheets(parsed, list.map((f) => f.name).join(", "));
      } catch (e) {
        toast.dismiss(id);
        toast.error(e instanceof Error ? e.message : "Could not read that file.");
      }
    },
    [loadSheets],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!e.clipboardData) return;
      const image = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
      if (image) {
        toast.info(
          "Image extraction is not available yet. Import a spreadsheet or paste a text table.",
        );
        return;
      }
      try { const parsed = parseClipboard(e.clipboardData); if (parsed) { e.preventDefault(); loadSheets(parsed, "clipboard"); } } catch (error) { toast.error(error instanceof Error ? error.message : "Paste failed"); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadSheets]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        sheetHistory.undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        sheetHistory.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetHistory]);

  const onRangeChange = (row: number, col: number, values: string[][]) => {
    if (row + values.length > MAX_ROWS || col + values.reduce((n, r) => Math.max(n, r.length), 0) > MAX_COLS) { toast.error("Paste exceeds workbook limits."); return; }
    const after = sheets.map((sh, i) => {
      if (i !== activeIndex) return sh;
      const rows = sh.rows.map(r => [...r]);
      values.forEach((line, r) => { while (rows.length <= row + r) rows.push([]); const target = rows[row + r]!; while (target.length < col + line.length) target.push(""); line.forEach((value, c) => { target[col + c] = value; }); });
      return { ...sh, rows };
    });
    try { validateWorkbook(after); setSheets(after); } catch (e) { toast.error(e instanceof Error ? e.message : "Invalid edit"); }
  };
  const onCellChange = (row: number, col: number, value: string) => onRangeChange(row, col, [[value]]);
  const send = async (prompt?: string) => {
    const text = (prompt ?? input).trim(); if (!text || busyRef.current) return;
    if (proposal) { toast.info("Apply or discard the pending proposal first."); return; }
    const id = ++requestId.current, before = sheets; busyRef.current = true;
    setInput(""); setPanel("chat"); setMobileView("assistant"); setMessages(m => [...m, { role: "user", content: text }]); setBusy(true);
    try {
      const result = await runAgent({ data: { prompt: text, sheets: before, history: messages.slice(-8).map(m => ({ ...m, content: m.content.slice(0, 20000) })), mode, quality, activeSheet: activeSheet.name } });
      if (id !== requestId.current) return;
      setFormulas(result.formulas); setVba(result.vba); setAudit({ issues: result.issues, fixes: result.fixes }); setMessages(m => [...m, { role: "assistant", content: result.reply }]);
      const diff = workbookDiff(before, result.sheets);
      if (diff.total || diff.added.length || diff.removed.length) { setProposal({ before, after: result.sheets, label: "AI workbook proposal" }); toast.success("Proposal ready — review before applying"); } else toast.success("Analysis ready");
    } catch (e) {
      if (id !== requestId.current) return;
      const msg = e instanceof Error ? e.message : "The AI request failed."; setMessages(m => [...m, { role: "assistant", content: `**Request failed.** ${msg}` }]); setInput(text); toast.error(msg);
    } finally { if (id === requestId.current) { busyRef.current = false; setBusy(false); } }
  };

  const addSheet = () => {
    if (sheets.length >= 30) { toast.error("Maximum 30 sheets."); return; }
    setSheets(prev => [...prev, emptySheet(sanitizeSheetName(`Sheet${prev.length + 1}`, new Set(prev.map(sh => sh.name.toLowerCase()))))]);
    setActiveIndex(sheets.length);
  };

  const removeSheet = (index: number) => {
    if (sheets.length === 1) return;
    setSheets((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex(0);
  };

  const loadTemplate = (template: FinancialTemplate) => {
    try { loadSheets(template.build(), template.name); setHubOpen(false); } catch (error) { toast.error(error instanceof Error ? error.message : "Template failed"); }
  };

  const extendTemplate = (template: FinancialTemplate) => {
    setHubOpen(false);
    void send(template.prompt);
  };

  const onAssumptionChange = (a: Assumption, value: number) => {
    setSheets((prev) =>
      prev.map((s, si) => {
        if (si !== a.sheet) return s;
        const rows = s.rows.map((r) => [...r]);
        const target = rows[a.row];
        if (!target) return s;
        while (target.length <= a.col) target.push("");
        target[a.col] = a.isPercent ? `${value}%` : String(value);
        return { ...s, rows };
      }),
    );
  };

  const setDriverCell = (label: RegExp, value: string) => {
    setSheets((prev) =>
      prev.map((s) => {
        const idx = s.rows.findIndex((r) => label.test((r[0] ?? "").trim()));
        if (idx === -1) return s;
        const rows = s.rows.map((r) => [...r]);
        const target = rows[idx] as string[];
        while (target.length <= 1) target.push("");
        target[1] = value;
        return { ...s, rows };
      }),
    );
  };

  const exportStyled = async () => {
    const id = toast.loading("Building styled workbook…");
    try {
      await downloadStyledWorkbook(sheets, "sheetsmith-model");
      toast.dismiss(id);
      toast.success("Styled .xlsx downloaded");
    } catch (e) {
      toast.dismiss(id);
      toast.error(e instanceof Error ? e.message : "Export failed.");
    }
  };

  const pushPowerBiWorkbook = async () => {
    const id = toast.loading("Pushing to Power BI…");
    try {
      const result = await pushPowerBi({ data: { sheets } });
      toast.dismiss(id);
      toast.success(
        `Pushed ${result.rowsPushed} rows across ${result.tablesPushed} table${
          result.tablesPushed === 1 ? "" : "s"
        } to "${result.datasetName}"`,
      );
    } catch (e) {
      toast.dismiss(id);
      toast.error(e instanceof Error ? e.message : "Power BI push failed.");
    }
  };

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileSpreadsheet className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight">SheetSmith</h1>
            <p className="text-xs text-muted-foreground">AI Excel analyzer, builder & editor</p>
          </div>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className={cn(
            "ml-auto flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
            dragging && "border-primary bg-accent text-foreground",
          )}
        >
          <Upload className="size-4" />
          <span className="max-w-[16rem] truncate">
            {fileName ?? "Upload .xlsx, .xls, .csv, .ods and more"}
          </span>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />

        <Button
          size="sm"
          variant="outline"
          disabled={!sheetHistory.canUndo}
          onClick={() => sheetHistory.undo()}
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!sheetHistory.canRedo}
          onClick={() => sheetHistory.redo()}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          <Redo2 className="size-4" />
        </Button>

        <Button size="sm" variant="outline" onClick={() => setHubOpen(true)}>
          <LayoutTemplate className="size-4" /> Templates
        </Button>

        <Button size="sm" variant="outline" onClick={() => setDashboardOpen(true)}>
          <BarChart3 className="size-4" /> Dashboard
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Download className="size-4" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void exportStyled()}>
              Download styled .xlsx (model colours)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadWorkbook(sheets, "xlsx", "sheetsmith")}>
              Download plain .xlsx
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => downloadWorkbook([activeSheet], "csv", activeSheet.name)}
            >
              Download .csv (active sheet)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void pushPowerBiWorkbook()}>
              Push to Power BI
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Badge variant="secondary" className="gap-1.5 font-normal">
          <span
            className={cn("size-2 rounded-full", busy ? "animate-pulse bg-chart-3" : "bg-primary")}
          />
          AI workbook assistant
        </Badge>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={liveIssues.length > 0 ? "destructive" : "outline"}
              className="gap-1.5"
            >
              {liveIssues.length > 0 ? (
                <TriangleAlert className="size-4" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {liveIssues.length > 0
                ? `${liveIssues.length} issue${liveIssues.length === 1 ? "" : "s"}`
                : "No issues detected"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="end">
            {liveIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No issues found by the static checks. This is not an Excel calculation engine; validate results in Excel.
              </p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-auto text-sm">
                {liveIssues.slice(0, 100).map((issue, i) => (
                  <div key={i} className="rounded-md border border-border p-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      {issue.sheet}!{issue.cell} · {issue.kind}
                    </p>
                    <p>{issue.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs">
        <div className="flex gap-1 lg:hidden"><Button size="sm" variant={mobileView === "sheet" ? "secondary" : "ghost"} onClick={() => setMobileView("sheet")}>Workbook</Button><Button size="sm" variant={mobileView === "assistant" ? "secondary" : "ghost"} onClick={() => setMobileView("assistant")}>Assistant / insights</Button></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={autosave} onChange={e => { const enabled = e.target.checked; setAutosave(enabled); if (!enabled) { try { localStorage.removeItem(WORKSPACE_KEY); setSaveStatus("Local saving off"); } catch { setSaveStatus("Could not clear saved copy — clear browser site data"); } } }} />Save on this device</label>
        <span className="text-muted-foreground" role="status">{saveStatus}</span><button className="underline" onClick={() => downloadWorkspace({ version: 1, sheets, messages, fileName, savedAt: new Date().toISOString() })}>Download backup</button><button className="underline" onClick={() => backupRef.current?.click()}>Restore backup</button>
        <input type="file" accept=".json" ref={backupRef} className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void (async () => { try { if (file.size > 8000000) throw new Error("Backup exceeds 8 MB."); const saved = parseWorkspace(await file.text()); loadSheets(saved.sheets, saved.fileName || "Workspace backup"); setMessages(saved.messages); } catch (error) { toast.error(error instanceof Error ? error.message : "Restore failed"); } })(); e.target.value = ""; }} />
      </div>
      {proposal && <ChangePreview proposal={proposal} stale={sheets !== proposal.before} onDiscard={() => setProposal(null)} onApply={() => { if (sheets !== proposal.before) return; setSheets(proposal.after); setActiveIndex(0); setProposal(null); toast.success("Changes applied. Undo is available."); }} />}
      <div className="flex min-h-0 flex-1">
        <main className={cn("min-w-0 flex-1 flex-col lg:flex", mobileView === "sheet" ? "flex" : "hidden")}>
          <div className="min-h-0 flex-1 border-r border-border">
            <SheetGrid
              key={activeSheet.name}
              sheet={activeSheet}
              onCellChange={onCellChange}
              onRangeChange={onRangeChange}
              highlightFormulas={highlightFormulas}
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto border-t border-r border-border bg-grid-header px-2 py-1.5">
            {sheets.map((s, i) => (
              <div
                key={`${s.name}-${i}`}
                onClick={() => setActiveIndex(i)}
                className={cn(
                  "group flex cursor-pointer items-center gap-1 rounded-t-md border border-b-0 border-border px-3 py-1 text-xs",
                  i === activeIndex
                    ? "bg-card font-semibold text-primary"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="max-w-[10rem] truncate">{s.name}</span>
                {sheets.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSheet(i);
                    }}
                    className="opacity-0 transition-opacity group-hover:opacity-60 hover:opacity-100"
                    aria-label={`Remove ${s.name}`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addSheet} className="h-7 px-2 text-xs">
              <Plus className="size-3.5" /> Sheet
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {activeSheet.rows.length} rows · paste tables directly with ⌘V
            </span>
          </div>
        </main>

        <div className={cn("w-full shrink-0 flex-col overflow-hidden lg:flex lg:w-[24rem]", mobileView === "assistant" ? "flex" : "hidden")}>
          <div className="flex shrink-0 gap-1 border-b bg-card p-2"><Button size="sm" variant={panel === "chat" ? "secondary" : "ghost"} onClick={() => setPanel("chat")}>AI chat</Button><Button size="sm" variant={panel === "insights" ? "secondary" : "ghost"} onClick={() => setPanel("insights")}>Data insights</Button></div>
          {panel === "insights" ? <div className="min-h-0 flex-1 overflow-auto"><InsightsPanel sheet={activeSheet} onPropose={proposeLocal} onAsk={text => { setMode("ask"); setInput(text); setPanel("chat"); }} disabled={busy || !!proposal} /></div> : <>

          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              onSend={send}
              busy={busy}
              mode={mode} onMode={setMode} quality={quality} onQuality={setQuality} onCancel={stopRequest}
              formulas={formulas}
              vba={vba}
              issues={audit.issues}
              fixes={audit.fixes}
            />
          </div>
          <div className="max-h-48 shrink-0 overflow-y-auto"><ModelControls
            assumptions={assumptions}
            scenario={scenario}
            onScenario={(v) => {
              setScenario(v);
              setDriverCell(/^scenario/i, v);
            }}
            depreciation={depreciation}
            onDepreciation={(v) => {
              setDepreciation(v);
              setDriverCell(/depreciation method|method/i, v);
            }}
            liveFormulas={highlightFormulas}
            onLiveFormulas={setHighlightFormulas}
            onAssumptionChange={onAssumptionChange}
          /></div></>}
        </div>
      </div>

      <TemplateHub
        open={hubOpen}
        onOpenChange={setHubOpen}
        onLoad={loadTemplate}
        onExtend={extendTemplate}
        onPrompt={(text) => void send(text)}
      />

      <DashboardHub
        open={dashboardOpen}
        onOpenChange={setDashboardOpen}
        sheets={sheets}
        activeIndex={activeIndex}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <p className="rounded-lg border-2 border-dashed border-primary bg-card px-6 py-4 text-sm font-medium">
            Drop your spreadsheet to import
          </p>
        </div>
      )}
    </div>
  );
}
