import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  Switch,
} from "@liquidai/react";
import { DOC_VERSION, newId, type DiagramDoc, type TidalNode } from "./diagram/doc";
import {
  duplicateInLibrary,
  listLibrary,
  getLibraryDoc,
  removeFromLibrary,
  type LibraryEntry,
} from "./diagram/library";
import { useDiagramStore } from "./diagram/store";

/** Mini schematic preview drawn from the doc's own geometry — no screenshots needed. */
function DocThumb({ doc }: { doc: DiagramDoc }) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const absPos = (n: TidalNode): { x: number; y: number } => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (!parent) return n.position;
    const p = absPos(parent);
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  const sizeOf = (n: TidalNode) => {
    if (n.type === "tidalGroup") {
      return {
        w: (n.style?.width as number) ?? 320,
        h: (n.style?.height as number) ?? 220,
      };
    }
    return { w: n.measured?.width ?? 200, h: n.measured?.height ?? 56 };
  };

  const rects = doc.nodes.map((n) => ({ n, pos: absPos(n), size: sizeOf(n) }));
  if (rects.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
        Empty diagram
      </div>
    );
  }

  const pad = 24;
  const minX = Math.min(...rects.map((r) => r.pos.x)) - pad;
  const minY = Math.min(...rects.map((r) => r.pos.y)) - pad;
  const maxX = Math.max(...rects.map((r) => r.pos.x + r.size.w)) + pad;
  const maxY = Math.max(...rects.map((r) => r.pos.y + r.size.h)) + pad;

  const center = (id: string) => {
    const r = rects.find((r) => r.n.id === id);
    return r ? { x: r.pos.x + r.size.w / 2, y: r.pos.y + r.size.h / 2 } : null;
  };

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-36 w-full"
    >
      {doc.edges.map((e) => {
        const s = center(e.source);
        const t = center(e.target);
        if (!s || !t) return null;
        return (
          <line
            key={e.id}
            x1={s.x}
            y1={s.y}
            x2={t.x}
            y2={t.y}
            stroke="var(--stroke-connector)"
            strokeWidth={Math.max(1.5, (maxX - minX) / 300)}
          />
        );
      })}
      {rects.map(({ n, pos, size }) => (
        <rect
          key={n.id}
          x={pos.x}
          y={pos.y}
          width={size.w}
          height={size.h}
          rx={n.type === "tidalPill" ? size.h / 2 : 10}
          fill={n.type === "tidalGroup" ? "none" : "var(--surface-raised)"}
          stroke="var(--surface-border)"
          strokeWidth={Math.max(1.5, (maxX - minX) / 300)}
        />
      ))}
    </svg>
  );
}

export function HomePage({
  dark,
  onDarkChange,
  onOpenMermaid,
  onOpenImage,
  onImportJson,
}: {
  dark: boolean;
  onDarkChange: (v: boolean) => void;
  onOpenMermaid: () => void;
  onOpenImage: () => void;
  onImportJson: () => void;
}) {
  const loadDoc = useDiagramStore((s) => s.loadDoc);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);

  useEffect(() => {
    setEntries(listLibrary());
  }, []);
  const refresh = () => setEntries(listLibrary());

  const newDiagram = () =>
    loadDoc({
      meta: { version: DOC_VERSION, title: "Untitled diagram", direction: "LR", docId: newId() },
      nodes: [],
      edges: [],
    });

  const openEntry = (entry: LibraryEntry) => {
    const doc = getLibraryDoc(entry.docId);
    if (doc) loadDoc({ ...doc, meta: { ...doc.meta, docId: entry.docId } });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-sidebar px-6">
        <span className="font-sans text-sm font-semibold">Tidal Diagrams</span>
        <Badge variant="secondary">beta</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="home-dark" checked={dark} onCheckedChange={onDarkChange} />
          <Label htmlFor="home-dark" className="text-sm text-muted-foreground">
            Dark
          </Label>
        </div>
      </header>

      <section className="flex flex-col items-center px-6 pb-16 pt-24 text-center">
        <h1 className="font-sans text-3xl font-semibold tracking-tight text-foreground">
          It&rsquo;s time to diagram.
        </h1>
        <p className="mt-3 max-w-md font-sans text-sm leading-relaxed text-muted-foreground">
          Build flow and architecture diagrams in the Tidal style — from scratch, from Mermaid, or
          from a screenshot.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Button size="lg" onClick={newDiagram}>
            New diagram
          </Button>
          <span className="font-sans text-sm text-muted-foreground">or</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="lg">
                Import&ensp;▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={onOpenMermaid}>Mermaid…</DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenImage}>Image…</DropdownMenuItem>
              <DropdownMenuItem onSelect={onImportJson}>JSON file…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20">
        <h2 className="mb-4 font-sans text-sm font-medium text-foreground">Recents</h2>
        {entries.length === 0 ? (
          <p className="py-10 text-center font-sans text-sm text-muted-foreground">
            Nothing here yet — your diagrams will show up as you create them.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
            {entries.map((entry) => (
              <div
                key={entry.docId}
                className="group overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  className="block w-full border-b border-border bg-background p-3"
                  onClick={() => openEntry(entry)}
                  aria-label={`Open ${entry.title}`}
                >
                  <DocThumb doc={entry.doc} />
                </button>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button className="min-w-0 flex-1 text-left" onClick={() => openEntry(entry)}>
                    <div className="truncate font-sans text-sm font-medium text-foreground">
                      {entry.title || "Untitled diagram"}
                    </div>
                    <div className="font-sans text-xs text-muted-foreground">
                      {entry.nodeCount} node{entry.nodeCount === 1 ? "" : "s"} ·{" "}
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        duplicateInLibrary(entry.docId);
                        refresh();
                      }}
                    >
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-status-error"
                      onClick={() => {
                        removeFromLibrary(entry.docId);
                        refresh();
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
