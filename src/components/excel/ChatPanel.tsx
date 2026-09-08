import { Loader2, Send, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const QUICK_PROMPTS = [
  "Reconcile Sheet A and Sheet B and flag unmatched items",
  "Clean white space & format currency",
  "Create a PivotTable-style summary by category",
  "Build an EFT payment log with validation rules",
  "Run a budget vs actual variance analysis",
  "Audit my formulas and list broken references",
  "Generate a 3-statement financial model skeleton",
  "Write VBA to protect all sheets and lock formulas",
];

type Props = {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: (prompt?: string) => void;
  busy: boolean;
  formulas: string[];
  vba: string;
  issues?: { sheet: string; cell: string; kind: string; detail: string }[];
  fixes?: string[];
};

export function ChatPanel({
  messages,
  input,
  setInput,
  onSend,
  busy,
  formulas,
  vba,
  issues = [],
  fixes = [],
}: Props) {

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-sidebar-primary" /> AI Command Center
        </h2>
        <p className="mt-1 text-xs text-sidebar-foreground/60">
          Describe the spreadsheet work — building, editing, reconciling or auditing.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
              Pre-built prompts
            </p>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => onSend(p)}
                disabled={busy}
                className="w-full rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-left text-xs leading-snug transition-colors hover:bg-sidebar-accent disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              m.role === "user"
                ? "ml-6 bg-sidebar-primary/15 text-sidebar-foreground"
                : "bg-sidebar-accent/60",
            )}
          >
            <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-li:my-0.5 prose-headings:text-sm">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/60 px-3 py-2 text-sm">
            <Loader2 className="size-4 animate-spin text-sidebar-primary" /> Working the workbook…
          </div>
        )}

        {formulas.length > 0 && (
          <div className="rounded-lg border border-sidebar-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
              Generated formulas
            </p>
            <div className="space-y-1">
              {formulas.map((f, i) => (
                <code
                  key={i}
                  className="block overflow-x-auto whitespace-pre rounded bg-sidebar-accent/70 px-2 py-1 font-mono text-[11px] text-sidebar-primary"
                >
                  {f}
                </code>
              ))}
            </div>
          </div>
        )}

        {vba && (
          <div className="rounded-lg border border-sidebar-border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
              <Terminal className="size-3.5" /> VBA / Macro
            </p>
            <pre className="max-h-64 overflow-auto rounded bg-sidebar-accent/70 p-2 font-mono text-[11px] leading-relaxed">
              {vba}
            </pre>
          </div>
        )}
        {(issues.length > 0 || fixes.length > 0) && (
          <div className="rounded-lg border border-sidebar-border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
              <ShieldCheck className="size-3.5" /> Workbook audit
            </p>
            {fixes.length > 0 && (
              <div className="mb-2 space-y-1">
                <p className="text-[11px] font-medium text-emerald-400">
                  Auto-repaired ({fixes.length})
                </p>
                {fixes.slice(0, 12).map((f, i) => (
                  <p key={i} className="text-[11px] leading-snug text-sidebar-foreground/75">
                    {f}
                  </p>
                ))}
              </div>
            )}
            {issues.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-amber-400">
                  Needs attention ({issues.length})
                </p>
                {issues.slice(0, 12).map((it, i) => (
                  <p key={i} className="text-[11px] leading-snug text-sidebar-foreground/75">
                    <span className="font-mono">
                      {it.sheet}!{it.cell}
                    </span>{" "}
                    — {it.detail}
                  </p>
                ))}
                {issues.length > 12 && (
                  <p className="text-[11px] text-sidebar-foreground/50">
                    +{issues.length - 12} more…
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-400">
                No broken references or unguarded formulas found.
              </p>
            )}
          </div>
        )}
        <div ref={endRef} />

      </div>

      <div className="border-t border-sidebar-border p-3">
        {messages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {QUICK_PROMPTS.slice(0, 3).map((p) => (
              <Badge
                key={p}
                onClick={() => !busy && onSend(p)}
                className="cursor-pointer bg-sidebar-accent text-[10px] font-normal text-sidebar-foreground hover:bg-sidebar-primary/30"
              >
                {p.split(" ").slice(0, 3).join(" ")}…
              </Badge>
            ))}
          </div>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="e.g. Reconcile the bank sheet against the ledger and add a variance column"
          className="min-h-[76px] resize-none border-sidebar-border bg-sidebar-accent/40 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40"
        />
        <Button onClick={() => onSend()} disabled={busy || !input.trim()} className="mt-2 w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Run instruction
        </Button>
      </div>
    </aside>
  );
}
