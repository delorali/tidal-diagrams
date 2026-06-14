import { useEffect, useMemo, useState } from "react";
import { Button } from "@liquidai/react";
import { QuickTextEditor } from "./diagram/QuickTextEditor";
import { QuickTextPreview } from "./diagram/QuickTextPreview";
import { parseQuickText } from "./diagram/quicktext";
import { specToDoc } from "./diagram/io";
import { TEMPLATES } from "./diagram/templates";
import { useDiagramStore } from "./diagram/store";

const PLACEHOLDER = `Type a diagram. For example:

Client ->|request| Gateway -> Service
Service -> Database #db

Edge devices:
  Macbook / Pipette-client
  iPhone / Pipette-client`;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ComposeView({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState("");
  const debounced = useDebounced(source, 250);
  const loadDoc = useDiagramStore((s) => s.loadDoc);

  const { spec, diagnostics } = useMemo(() => parseQuickText(debounced), [debounced]);
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const canCreate = spec.nodes.length > 0;

  const create = () => {
    if (!canCreate) return;
    const title = spec.nodes[0]?.label || "Untitled diagram";
    loadDoc(specToDoc(spec, title)); // docRevision bump navigates App to the editor
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Back to home">
          ← Home
        </Button>
        <span className="font-sans text-sm font-semibold">New from text</span>
        <div className="ml-auto flex items-center gap-3">
          {errorCount > 0 && (
            <span className="font-sans text-xs text-muted-foreground">
              {errorCount} line{errorCount === 1 ? "" : "s"} not understood
            </span>
          )}
          <Button size="sm" onClick={create} disabled={!canCreate}>
            Create diagram
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 min-w-0 flex-col border-r border-border">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
            <span className="mr-1 font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Templates
            </span>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                title={t.hint}
                onClick={() => setSource(t.source)}
                className="rounded-md border border-border px-2 py-1 font-sans text-xs text-foreground transition-colors hover:bg-accent"
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <QuickTextEditor value={source} onChange={setSource} placeholder={PLACEHOLDER} />
          </div>
        </div>
        <div className="w-1/2 min-w-0 bg-background">
          <QuickTextPreview source={debounced} />
        </div>
      </div>
    </div>
  );
}
