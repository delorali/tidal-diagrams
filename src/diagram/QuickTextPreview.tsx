import { useMemo } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { nodeTypes, edgeTypes } from "./flowTypes";
import { parseQuickText } from "./quicktext";
import { specToDoc } from "./io";

/**
 * Static, non-interactive render of Quick-text. Wrapped in `pointer-events:none`
 * so the shared node components can never mutate the real document while typing.
 * Remounts on content change (via `key`) to re-fit cleanly.
 */
export function QuickTextPreview({ source }: { source: string }) {
  const { doc, key, empty } = useMemo(() => {
    const { spec } = parseQuickText(source);
    if (spec.nodes.length === 0) return { doc: null, key: "empty", empty: true };
    const d = specToDoc(spec, "Preview");
    return { doc: d, key: `${d.nodes.length}:${d.edges.length}:${source.length}`, empty: false };
  }, [source]);

  if (empty || !doc) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center font-sans text-sm text-muted-foreground">
        Your diagram will appear here as you type.
      </div>
    );
  }

  return (
    <div className="pointer-events-none h-full w-full">
      <ReactFlowProvider>
        <ReactFlow
          key={key}
          defaultNodes={doc.nodes}
          defaultEdges={doc.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
