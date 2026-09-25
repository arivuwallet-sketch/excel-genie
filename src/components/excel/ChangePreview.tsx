import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { Sheet } from "@/lib/spreadsheet";
import { workbookDiff } from "@/lib/workbook-intelligence";
export type Proposal = { before: Sheet[]; after: Sheet[]; label: string };
export function ChangePreview({
  proposal,
  stale,
  onApply,
  onDiscard,
}: {
  proposal: Proposal;
  stale: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const diff = useMemo(() => workbookDiff(proposal.before, proposal.after), [proposal]);
  return (
    <section
      className="max-h-[45vh] shrink-0 overflow-auto border-b border-primary/30 bg-accent/30 p-4"
      aria-label="Review proposed changes"
    >
      <h2 className="text-sm font-semibold">Review changes · {proposal.label}</h2>
      <p className="my-1 text-xs text-muted-foreground">
        {diff.total.toLocaleString()} changed cells · {diff.added.length} added sheets ·{" "}
        {diff.removed.length} removed sheets
      </p>
      {diff.removed.length > 0 && (
        <p className="text-xs text-destructive">Removed sheets: {diff.removed.join(", ")}</p>
      )}
      {stale && (
        <p className="my-2 text-xs text-destructive">
          The workbook changed after this proposal was created. Discard it and run the request
          again.
        </p>
      )}
      <div className="my-3 flex gap-2">
        <Button size="sm" disabled={stale} onClick={onApply}>
          Apply changes
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>
          Discard
        </Button>
      </div>
      <div className="max-h-44 overflow-auto rounded border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="p-2">Cell</th>
              <th className="p-2">Before</th>
              <th className="p-2">After</th>
            </tr>
          </thead>
          <tbody>
            {diff.changes.map((c) => (
              <tr key={`${c.sheet}!${c.cell}`} className="border-t">
                <td className="p-2 font-mono">
                  {c.sheet}!{c.cell}
                </td>
                <td className="max-w-64 truncate p-2" title={c.before}>
                  {c.before || "∅"}
                </td>
                <td className="max-w-64 truncate p-2" title={c.after}>
                  {c.after || "∅"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {diff.total > diff.changes.length && (
        <p className="mt-1 text-xs">
          Showing the first {diff.changes.length} changes. All {diff.total} will apply together.
        </p>
      )}
    </section>
  );
}
