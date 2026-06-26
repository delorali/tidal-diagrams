import { useReactFlow } from "@xyflow/react";
import { Button, Separator, Tooltip, TooltipContent, TooltipTrigger } from "@liquidai/react";
import { useDiagramStore } from "./store";
import type { CreatableNodeType } from "./doc";

const GLYPHS: Record<string, React.ReactNode> = {
  node: <rect x="1.5" y="4.5" width="13" height="7" rx="2" />,
  header: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M1.5 6.5h13" />
    </>
  ),
  rows: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <path d="M1.5 5.8h13M1.5 10.2h13" />
    </>
  ),
  label: <rect x="1.5" y="4.5" width="13" height="7" rx="3.5" />,
  db: (
    <>
      <ellipse cx="8" cy="3.5" rx="6" ry="2" />
      <path d="M2 3.5v9c0 1.1 2.7 2 6 2s6-.9 6-2v-9" />
    </>
  ),
  group: <rect x="1.5" y="1.5" width="13" height="13" rx="3" strokeDasharray="3 2.4" />,
};

const TOOLS: { key: string; name: string; type: CreatableNodeType; preset?: "header" | "rows" }[] = [
  { key: "node", name: "Node", type: "tidalCard" },
  { key: "header", name: "Node with header", type: "tidalCard", preset: "header" },
  { key: "rows", name: "Node with rows", type: "tidalCard", preset: "rows" },
  { key: "label", name: "Label", type: "tidalPill" },
  { key: "db", name: "Database", type: "tidalCylinder" },
  { key: "group", name: "Group", type: "tidalGroup" },
];

/** Flora-style floating add-node bar, bottom center of the canvas. */
export function Toolbar() {
  const addNode = useDiagramStore((s) => s.addNode);
  const tidy = useDiagramStore((s) => s.tidy);
  const { screenToFlowPosition } = useReactFlow();

  const addAtCenter = (type: CreatableNodeType, preset?: "header" | "rows") => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    // de-overlap successive adds a touch
    const jitter = () => Math.round((Math.random() - 0.5) * 48);
    addNode(type, { x: center.x + jitter(), y: center.y + jitter() }, preset);
  };

  return (
    <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
      {TOOLS.map((tool) => (
        <Tooltip key={tool.key}>
          <TooltipTrigger asChild>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => addAtCenter(tool.type, tool.preset)}
              aria-label={tool.name}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                {GLYPHS[tool.key]}
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{tool.name}</TooltipContent>
        </Tooltip>
      ))}
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={tidy}>
        Tidy
      </Button>
    </div>
  );
}
