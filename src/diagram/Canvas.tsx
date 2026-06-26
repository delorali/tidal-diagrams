import { useCallback, useEffect, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  useReactFlow,
  type FinalConnectionState,
  type IsValidConnection,
} from "@xyflow/react";
import { useDiagramStore } from "./store";
import type { TidalEdgeT, TidalNode } from "./doc";
import { nodeTypes, edgeTypes } from "./flowTypes";
import { NODE_TYPE_OPTIONS } from "./NodePlusToolbar";

/** Floating menu shown when a connection is dropped on empty canvas. */
function SpawnMenu() {
  const spawnMenu = useDiagramStore((s) => s.spawnMenu);
  const spawnAtPoint = useDiagramStore((s) => s.spawnAtPoint);
  const setSpawnMenu = useDiagramStore((s) => s.setSpawnMenu);
  if (!spawnMenu?.flow) return null;
  return (
    <div
      className="absolute z-50 min-w-44 rounded-lg border border-border bg-card p-1 shadow-lg"
      style={{ left: spawnMenu.screen.x, top: spawnMenu.screen.y }}
    >
      <div className="px-2 py-1.5 font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Add node
      </div>
      {NODE_TYPE_OPTIONS.map((opt) => (
        <button
          key={opt.name}
          className="block w-full rounded-md px-2 py-1.5 text-left font-sans text-sm text-foreground hover:bg-accent"
          onClick={() => spawnAtPoint(spawnMenu.fromNodeId, spawnMenu.flow!, opt.type, opt.preset)}
        >
          {opt.name}
        </button>
      ))}
      <button
        className="block w-full rounded-md px-2 py-1.5 text-left font-sans text-sm text-muted-foreground hover:bg-accent"
        onClick={() => setSpawnMenu(null)}
      >
        Cancel
      </button>
    </div>
  );
}

export function Canvas() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const onNodesChange = useDiagramStore((s) => s.onNodesChange);
  const onEdgesChange = useDiagramStore((s) => s.onEdgesChange);
  const onConnect = useDiagramStore((s) => s.onConnect);
  const drawFloatingEdge = useDiagramStore((s) => s.drawFloatingEdge);
  const endDrag = useDiagramStore((s) => s.endDrag);
  const setHoveredNode = useDiagramStore((s) => s.setHoveredNode);
  const setSpawnMenu = useDiagramStore((s) => s.setSpawnMenu);
  const docRevision = useDiagramStore((s) => s.docRevision);

  const { fitView, screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    requestAnimationFrame(() => fitView({ padding: 0.15, duration: 200 }));
  }, [docRevision, fitView]);

  const isValidConnection: IsValidConnection<TidalEdgeT> = useCallback(
    (conn) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return false;
      const find = (id: string | null) => nodes.find((n) => n.id === id);
      if (find(conn.source)?.type === "tidalGroup" || find(conn.target)?.type === "tidalGroup") return false;
      return !edges.some((e) => e.source === conn.source && e.target === conn.target);
    },
    [nodes, edges],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid || !connectionState.fromNode) return;
      const from = connectionState.fromNode;

      // Dropped on a node body (outside handle snap radius): connect directly.
      // RF only sets toNode near a handle, so hit-test the DOM instead.
      const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;
      const dropNodeId = document
        .elementFromPoint(clientX, clientY)
        ?.closest(".react-flow__node")
        ?.getAttribute("data-id");
      if (dropNodeId && dropNodeId !== from.id) {
        onConnect({
          source: from.id,
          target: dropNodeId,
          sourceHandle: connectionState.fromHandle?.id ?? null,
          targetHandle: null,
        });
        return;
      }

      // Dropped on empty canvas: draw the edge to a floating point (free anchor),
      // which can later be dragged onto a node or repositioned.
      drawFloatingEdge(from.id, screenToFlowPosition({ x: clientX, y: clientY }));
    },
    [screenToFlowPosition, drawFloatingEdge, onConnect],
  );

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <ReactFlow<TidalNode, TidalEdgeT>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesFocusable={false}
        edgesFocusable={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Shift", "Meta"]}
        connectionLineStyle={{ stroke: "var(--stroke-connector)", strokeWidth: 1 }}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode={null}
        onNodeDragStop={endDrag}
        onNodeMouseEnter={(_, node) => {
          clearTimeout(leaveTimer.current);
          setHoveredNode(node.id);
        }}
        onNodeMouseLeave={() => {
          clearTimeout(leaveTimer.current);
          leaveTimer.current = setTimeout(() => setHoveredNode(null), 150);
        }}
        onPaneClick={() => setSpawnMenu(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--canvas-dot)" />
      </ReactFlow>
      <SpawnMenu />
    </div>
  );
}
