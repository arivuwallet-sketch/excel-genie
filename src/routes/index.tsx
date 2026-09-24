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

  const loadSheets = useCallback(
    (next: Sheet[], label: string) => {
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
          "Pasted image received — describe what to extract and the AI will transcribe it.",
        );
        return;
      }
      const parsed = parseClipboard(e.clipboardData);
      if (parsed) {
        e.preventDefault();
        loadSheets(parsed, "clipboard");
      }
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

  const onCellChange = (row: number, col: number, value: string) => {
    setSheets((prev) =>
      prev.map((s, i) => {
        if (i !== activeIndex) return s;
        const rows = s.rows.map((r) => [...r]);
        while (rows.length <= row) rows.push([]);
        const target = rows[row] as string[];
        while (target.length <= col) target.push("");
        target[col] = value;
        return { ...s, rows };
      }),
    );
  };

  const send = async (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const result = await runAgent({
        data: {
          prompt: text,
          sheets: sheets.map((s) => ({ name: s.name, rows: s.rows })),
          history: messages.slice(-8),
        },
      });
      if (result.sheets.length) {
        setSheets(result.sheets);
        setActiveIndex(0);
      }
      setFormulas(result.formulas ?? []);
      setVba(result.vba ?? "");
      setAudit({ issues: result.issues ?? [], fixes: result.fixes ?? [] });

      setMessages((m) => [...m, { role: "assistant", content: result.reply }]);
      toast.success("Workbook updated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The AI request failed.";
      setMessages((m) => [...m, { role: "assistant", content: `**Request failed.** ${msg}` }]);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const addSheet = () => {
    setSheets((prev) => [...prev, emptySheet(`Sheet${prev.length + 1}`)]);
    setActiveIndex(sheets.length);
  };

  const removeSheet = (index: number) => {
    if (sheets.length === 1) return;
    setSheets((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex(0);
  };

  const loadTemplate = (template: FinancialTemplate) => {
    loadSheets(template.build(), template.name);
    setHubOpen(false);
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
      className="flex h-screen flex-col overflow-hidden bg-background"
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
            {fileName ?? "Drop or click to upload — xlsx, xls, csv, ods, pdf, dbf & more"}
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
          Lovable AI · auto-routed (Flash / Pro / Astra)
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
                : "Audit clean"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="end">
            {liveIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No formula issues detected — every reference, division and spill is guarded.
              </p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-auto text-sm">
                {liveIssues.map((issue, i) => (
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

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 border-r border-border">
            <SheetGrid
              sheet={activeSheet}
              onCellChange={onCellChange}
              highlightFormulas={highlightFormulas}
            />
          </div>
          <div className="flex items-center gap-1 border-t border-r border-border bg-grid-header px-2 py-1.5">
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

        <div className="flex w-[24rem] shrink-0 flex-col overflow-y-auto max-lg:hidden">
          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              onSend={send}
              busy={busy}
              formulas={formulas}
              vba={vba}
              issues={audit.issues}
              fixes={audit.fixes}
            />
          </div>
          <ModelControls
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
          />
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
