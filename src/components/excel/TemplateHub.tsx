import { Search, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ALL_TEMPLATES,
  TIERS,
  matchTemplate,
  templatesByTier,
  type FinancialTemplate,
  type TemplateTier,
} from "@/lib/templates";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (template: FinancialTemplate) => void;
  onExtend: (template: FinancialTemplate) => void;
  onPrompt: (text: string) => void;
};

const TIER_BLURB: Record<TemplateTier, string> = {
  Basic: "Everyday budgeting, bookkeeping and tracking workbooks.",
  Intermediate: "Three-statement models, reconciliations, aging and variance packs.",
  Advanced: "DCF, LBO, M&A accretion/dilution, SaaS metrics and scenario engines.",
  Quantitative: "Monte Carlo, Black-Scholes Greeks, risk and statistical engines.",
  Dashboards: "KPI boards, executive summaries and interactive reporting views.",
  Institutional: "Cap tables, bank, real estate, REIT, shipping and FinOps models.",
};

export function TemplateHub({ open, onOpenChange, onLoad, onExtend, onPrompt }: Props) {
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_TEMPLATES.filter((t) =>
      `${t.name} ${t.blurb} ${t.features.join(" ")} ${t.tier}`.toLowerCase().includes(q),
    );
  }, [query]);

  const submitPrompt = () => {
    const text = prompt.trim();
    if (!text) return;
    const match = matchTemplate(text);
    if (match) {
      onLoad(match);
      onExtend({ ...match, prompt: text });
    } else {
      onPrompt(text);
    }
    setPrompt("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Financial Template Library
          </DialogTitle>
          <DialogDescription>
            {ALL_TEMPLATES.length} formula-driven workbooks. Load one into the workspace, then edit
            or ask the AI to extend it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates — reconciliation, DCF, payroll, aging…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex gap-2 rounded-md border border-dashed border-border bg-accent/40 p-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitPrompt()}
            placeholder='Describe a workbook: "SaaS 3-statement model with a 5-year DCF"'
          />
          <Button onClick={submitPrompt} className="shrink-0">
            <Wand2 className="size-4" /> Generate
          </Button>
        </div>

        {filtered ? (
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <Grid templates={filtered} onLoad={onLoad} onExtend={onExtend} />
          </ScrollArea>
        ) : (
          <Tabs defaultValue="Basic" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="h-auto flex-wrap justify-start">
              {TIERS.map((tier) => (
                <TabsTrigger key={tier} value={tier}>
                  {tier}
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                    {templatesByTier(tier).length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {TIERS.map((tier) => (
              <TabsContent key={tier} value={tier} className="min-h-0 flex-1">
                <p className="mb-3 text-xs text-muted-foreground">{TIER_BLURB[tier]}</p>
                <ScrollArea className="h-[46vh] pr-3">
                  <Grid templates={templatesByTier(tier)} onLoad={onLoad} onExtend={onExtend} />
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Grid({
  templates,
  onLoad,
  onExtend,
}: {
  templates: FinancialTemplate[];
  onLoad: (t: FinancialTemplate) => void;
  onExtend: (t: FinancialTemplate) => void;
}) {
  if (!templates.length)
    return <p className="py-8 text-center text-sm text-muted-foreground">No templates match.</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {templates.map((t) => (
        <div
          key={t.id}
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">{t.name}</h3>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {t.tier}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{t.blurb}</p>
          <div className="flex flex-wrap gap-1">
            {t.features.slice(0, 4).map((f) => (
              <span
                key={f}
                className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
          <div className="mt-auto flex gap-2 pt-1">
            <Button size="sm" className="flex-1" onClick={() => onLoad(t)}>
              Load into workspace
            </Button>
            <Button size="sm" variant="outline" onClick={() => onExtend(t)}>
              <Sparkles className="size-3.5" /> Extend
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
