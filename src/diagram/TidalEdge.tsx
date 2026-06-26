import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@liquidai/react";
import { newId, type EdgeData } from "./doc";
import { NODE_COLORS } from "./nodeColors";
import { useDiagramStore } from "./store";
import { useIsDark } from "./useIsDark";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pick attachment sides from the dominant axis between node centers. */
function anchors(s: Rect, t: Rect) {
  const scx = s.x + s.w / 2;
  const scy = s.y + s.h / 2;
  const tcx = t.x + t.w / 2;
  const tcy = t.y + t.h / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0
      ? { sx: s.x + s.w, sy: scy, tx: t.x, ty: tcy, sp: Position.Right, tp: Position.Left }
      : { sx: s.x, sy: scy, tx: t.x + t.w, ty: tcy, sp: Position.Left, tp: Position.Right };
  }
  return dy > 0
    ? { sx: scx, sy: s.y + s.h, tx: tcx, ty: t.y, sp: Position.Bottom, tp: Position.Top }
    : { sx: scx, sy: s.y, tx: tcx, ty: t.y + t.h, sp: Position.Top, tp: Position.Bottom };
}

/** Point on a rect's border facing an arbitrary target point (for waypoint routing). */
function attachToward(r: Rect, toX: number, toY: number): { x: number; y: number } {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = toX - cx;
  const dy = toY - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? { x: r.x + r.w, y: cy } : { x: r.x, y: cy };
  }
  return dy > 0 ? { x: cx, y: r.y + r.h } : { x: cx, y: r.y };
}

export function TidalEdge(props: EdgeProps) {
  const { id, source, target, markerEnd, markerStart, selected } = props;
  const data = (props.data ?? {}) as EdgeData;
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);
  const detachEdgeEnd = useDiagramStore((s) => s.detachEdgeEnd);
  const moveAnchor = useDiagramStore((s) => s.moveAnchor);
  const reconnectEdgeEnd = useDiagramStore((s) => s.reconnectEdgeEnd);
  const nodeAtPoint = useDiagramStore((s) => s.nodeAtPoint);
  const isDark = useIsDark();
  const { screenToFlowPosition } = useReactFlow();

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  // Active waypoint drag: holds the index + a working copy of the points.
  const dragRef = useRef<{ index: number; wps: { x: number; y: number }[] } | null>(null);
  // Active endpoint drag: which end, the free anchor it's on (once detached),
  // a pre-generated anchor id, and the last cursor flow point (for drop hit-test).
  const endRef = useRef<{
    end: "source" | "target";
    anchorId: string | null;
    pendingId: string;
    last: { x: number; y: number } | null;
  } | null>(null);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!sourceNode || !targetNode) return null;

  // Floating attachment: computed from live node bounds, not stored handles,
  // so edges stay on the right side as nodes are dragged around.
  const sRect: Rect = {
    x: sourceNode.internals.positionAbsolute.x,
    y: sourceNode.internals.positionAbsolute.y,
    w: sourceNode.measured.width ?? 0,
    h: sourceNode.measured.height ?? 0,
  };
  const tRect: Rect = {
    x: targetNode.internals.positionAbsolute.x,
    y: targetNode.internals.positionAbsolute.y,
    w: targetNode.measured.width ?? 0,
    h: targetNode.measured.height ?? 0,
  };
  const { sx, sy, tx, ty, sp, tp } = anchors(sRect, tRect);
  const waypoints = data.waypoints ?? [];

  let path: string;
  let labelX: number;
  let labelY: number;
  // Full point chain (endpoint attach → waypoints → endpoint attach), also used
  // to position the drag/add handles. Endpoints face their nearest waypoint.
  let polyPts: { x: number; y: number }[];

  if (waypoints.length > 0) {
    const sAtt = attachToward(sRect, waypoints[0].x, waypoints[0].y);
    const tAtt = attachToward(tRect, waypoints[waypoints.length - 1].x, waypoints[waypoints.length - 1].y);
    polyPts = [sAtt, ...waypoints, tAtt];
    path = "M " + polyPts.map((p) => `${p.x} ${p.y}`).join(" L ");
    const mid = polyPts[Math.floor((polyPts.length - 1) / 2)];
    labelX = mid.x;
    labelY = mid.y;
  } else if (data.curveOffset) {
    // Quadratic curve bowed perpendicular to the edge; passes through mid + offset.
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const len = Math.hypot(tx - sx, ty - sy) || 1;
    const px = -(ty - sy) / len;
    const py = (tx - sx) / len;
    path = `M ${sx} ${sy} Q ${mx + px * data.curveOffset * 2} ${my + py * data.curveOffset * 2} ${tx} ${ty}`;
    labelX = mx + px * data.curveOffset;
    labelY = my + py * data.curveOffset;
    polyPts = [{ x: sx, y: sy }, { x: tx, y: ty }];
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition: sp,
      targetPosition: tp,
      curvature: 0.35,
    });
    polyPts = [{ x: sx, y: sy }, { x: tx, y: ty }];
  }

  // Waypoint editing (handles shown while the edge is selected).
  const setWaypoints = (wps: { x: number; y: number }[]) =>
    updateEdgeData(id, { waypoints: wps.length ? wps : undefined });
  const onHandleDown = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { index, wps: [...waypoints] };
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const wps = [...dragRef.current.wps];
    wps[dragRef.current.index] = { x: Math.round(p.x), y: Math.round(p.y) };
    dragRef.current.wps = wps;
    updateEdgeData(id, { waypoints: wps });
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };
  /** Insert a waypoint splitting segment `k` (between polyPts[k] and polyPts[k+1]). */
  const addWaypoint = (k: number) => {
    const a = polyPts[k];
    const b = polyPts[k + 1];
    const wps = [...waypoints];
    wps.splice(k, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
    setWaypoints(wps);
  };

  // Endpoint drag: move off a node to detach onto a free anchor; drop on a node
  // to (re)connect; drop in empty space to leave it floating.
  const onEndDown = (end: "source" | "target") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const endpointId = end === "source" ? source : target;
    const node = useDiagramStore.getState().nodes.find((n) => n.id === endpointId);
    const onAnchor = node?.type === "tidalAnchor" && (node.data as { vector?: boolean })?.vector;
    endRef.current = { end, anchorId: onAnchor ? endpointId : null, pendingId: `va-${newId()}`, last: null };
  };
  const onEndMove = (e: React.PointerEvent) => {
    const d = endRef.current;
    if (!d) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    d.last = p;
    if (!d.anchorId) {
      detachEdgeEnd(id, d.end, d.pendingId, p); // first move detaches from the node
      d.anchorId = d.pendingId;
    } else {
      moveAnchor(d.anchorId, p);
    }
  };
  const onEndUp = (e: React.PointerEvent) => {
    const d = endRef.current;
    endRef.current = null;
    if (!d) return;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    if (!d.last || !d.anchorId) return;
    const otherEnd = d.end === "source" ? target : source;
    const hit = nodeAtPoint(d.last.x, d.last.y, [d.anchorId, otherEnd]);
    if (hit) reconnectEdgeEnd(id, d.end, hit);
  };

  const commit = () => {
    setEditing(false);
    updateEdgeData(id, { label: draft.trim() || undefined });
  };

  // Sequence-message labels read as text sitting ABOVE the arrow (Mermaid style),
  // not as a centered chip on the line. Self-loops (same lane) center over the
  // loop; cross-lane messages center above the horizontal line.
  const seq = !!data.seqLabel;
  const selfLoop = seq && Math.abs(sx - tx) < 1;
  const seqLabelX = seq ? (selfLoop ? sx : (sx + tx) / 2) : labelX;
  const seqLabelY = seq ? Math.min(sy, ty) - 12 : labelY;

  // Edge tint: stroke uses the hue's border shade, label uses the ghost shade.
  // SVG strokes can't switch on `.dark` via CSS, so resolve the value in JS.
  const shades = data.color ? NODE_COLORS[data.color] : null;
  const strokeColor = shades ? shades.border[isDark ? 1 : 0] : "var(--stroke-connector)";
  const labelColor = shades ? shades.ghost[isDark ? 1 : 0] : undefined;

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: selected ? "var(--border-focus)" : strokeColor,
          strokeWidth: selected ? 1.5 : 1,
          strokeDasharray: data.dotted ? "2.5 4" : undefined,
        }}
      />
      {(data.label || editing) && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan absolute font-sans",
              seq
                ? "max-w-[280px] whitespace-nowrap rounded bg-background/85 px-1 text-[12px] leading-[18px] text-foreground"
                : "tidal-glass-pill max-w-[180px] px-[10px] py-2 text-center text-[13px] leading-[21px]",
              selected && "ring-1 ring-focus",
            )}
            style={{
              transform: seq
                ? `translate(-50%, -100%) translate(${seqLabelX}px, ${seqLabelY}px)`
                : `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              ...(labelColor && !selected ? { color: labelColor } : {}),
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(data.label ?? "");
              setEditing(true);
            }}
          >
            {editing ? (
              <input
                ref={inputRef}
                className="bg-transparent text-center outline-none"
                style={{ width: `${Math.max(draft.length, 4) + 1}ch` }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditing(false);
                  e.stopPropagation();
                }}
              />
            ) : (
              data.label
            )}
          </div>
        </EdgeLabelRenderer>
      )}
      {selected && (
        <EdgeLabelRenderer>
          {/* endpoint handles: drag onto a node to (re)connect, or into space to detach */}
          {(["source", "target"] as const).map((end) => {
            const p = end === "source" ? polyPts[0] : polyPts[polyPts.length - 1];
            return (
              <div
                key={`end-${end}`}
                title="Drag to reconnect or detach"
                className="nodrag nopan absolute h-3 w-3 cursor-move rounded-full border-2 border-focus bg-card"
                style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`, pointerEvents: "all" }}
                onPointerDown={onEndDown(end)}
                onPointerMove={onEndMove}
                onPointerUp={onEndUp}
              />
            );
          })}
          {/* "+" on each segment midpoint to insert a waypoint */}
          {polyPts.slice(0, -1).map((p, k) => {
            const mx = (p.x + polyPts[k + 1].x) / 2;
            const my = (p.y + polyPts[k + 1].y) / 2;
            return (
              <button
                key={`add-${k}`}
                type="button"
                title="Add point"
                className="nodrag nopan absolute flex h-4 w-4 items-center justify-center rounded-full border border-focus bg-card text-[11px] leading-none text-focus opacity-50 hover:opacity-100"
                style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)`, pointerEvents: "all" }}
                onClick={(e) => {
                  e.stopPropagation();
                  addWaypoint(k);
                }}
              >
                +
              </button>
            );
          })}
          {/* draggable waypoint dots (double-click to remove) */}
          {waypoints.map((wp, i) => (
            <div
              key={`wp-${i}`}
              title="Drag to move · double-click to remove"
              className="nodrag nopan absolute h-2.5 w-2.5 cursor-grab rounded-full border border-focus bg-card"
              style={{ transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`, pointerEvents: "all" }}
              onPointerDown={onHandleDown(i)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setWaypoints(waypoints.filter((_, j) => j !== i));
              }}
            />
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  );
}
