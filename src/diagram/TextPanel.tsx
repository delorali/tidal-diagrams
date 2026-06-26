import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from "@liquidai/react";
import { QuickTextEditor } from "./QuickTextEditor";
import { parseQuickText } from "./quicktext";
import { docToQuickText } from "./sync";
import { TEMPLATES } from "./templates";
import { useDiagramStore } from "./store";

const PLACEHOLDER = `Describe your diagram, e.g.

Client ->|request| Gateway -> Service
Service -> Database #db`;

export function TextPanel({ onClose }: { onClose: () => void }) {
  const applyQuickText = useDiagramStore((s) => s.applyQuickText);
  const [source, setSource] = useState(() => docToQuickText({
    meta: useDiagramStore.getState().meta,
    nodes: useDiagramStore.getState().nodes,
    edges: useDiagramStore.getState().edges,
  }));

  // Guards the text→doc→text loop: true while we're pushing text into the store.
  const suppressSerialize = useRef(false);
  const applyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const serializeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { diagnostics, unsupported } = useMemo(() => parseQuickText(source), [source]);
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;

  // doc → text: when the canvas changes structure, rewrite the panel text.
  useEffect(() => {
    const unsub = useDiagramStore.subscribe(() => {
      if (suppressSerialize.current) return;
      clearTimeout(serializeTimer.current);
      serializeTimer.current = setTimeout(() => {
        const s = useDiagramStore.getState();
        const text = docToQuickText({ meta: s.meta, nodes: s.nodes, edges: s.edges });
        setSource((prev) => (prev === text ? prev : text));
      }, 200);
    });
    return () => {
      unsub();
      clearTimeout(serializeTimer.current);
      clearTimeout(applyTimer.current);
    };
  }, []);

  const apply = (text: string) => {
    suppressSerialize.current = true;
    applyQuickText(text);
    suppressSerialize.current = false;
  };

  // text → doc: debounce the user's typing into the store.
  const onUserChange = (text: string) => {
    setSource(text);
    clearTimeout(serializeTimer.current); // don't let a canvas-sync overwrite mid-type
    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => apply(text), 320);
  };

  const loadTemplate = (text: string) => {
    setSource(text);
    apply(text); // templates replace + apply immediately
  };

  return (
    <div className="absolute inset-y-0 left-0 z-20 flex w-[360px] flex-col border-r border-border bg-sidebar shadow-lg">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="font-sans text-sm font-medium text-foreground">Diagram text</span>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                Templates&ensp;▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => loadTemplate(t.source)}>
                  {t.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <IconButton variant="ghost" size="sm" aria-label="Close text panel" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <div className="h-full overflow-hidden rounded-lg border border-input bg-card focus-within:border-focus">
          <QuickTextEditor value={source} onChange={onUserChange} placeholder={PLACEHOLDER} />
        </div>
      </div>
      <div
        className={`shrink-0 border-t border-border px-3 py-2 font-sans text-xs ${
          unsupported || errorCount > 0 ? "text-status-error" : "text-muted-foreground"
        }`}
      >
        {unsupported
          ? unsupported.keyword === "sequenceDiagram"
            ? "Sequence diagrams: use Toolbar → Import Mermaid to add one to the canvas."
            : `${unsupported.label} aren't supported yet — Tidal renders flowcharts.`
          : errorCount > 0
            ? `${errorCount} line${errorCount === 1 ? "" : "s"} not understood`
            : "Synced with the canvas · positions are kept as you type"}
      </div>
    </div>
  );
}
