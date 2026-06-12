import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  useInternalNode,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@liquidai/react";
import type { EdgeData } from "./doc";
import { useDiagramStore } from "./store";

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

export function TidalEdge(props: EdgeProps) {
  const { id, source, target, markerEnd, markerStart, selected } = props;
  const data = (props.data ?? {}) as EdgeData;
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
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

  let path: string;
  let labelX: number;
  let labelY: number;

  if (data.curveOffset) {
    // Quadratic curve bowed perpendicular to the edge; passes through mid + offset.
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const len = Math.hypot(tx - sx, ty - sy) || 1;
    const px = -(ty - sy) / len;
    const py = (tx - sx) / len;
    path = `M ${sx} ${sy} Q ${mx + px * data.curveOffset * 2} ${my + py * data.curveOffset * 2} ${tx} ${ty}`;
    labelX = mx + px * data.curveOffset;
    labelY = my + py * data.curveOffset;
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
  }

  const commit = () => {
    setEditing(false);
    updateEdgeData(id, { label: draft.trim() || undefined });
  };

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: selected ? "var(--border-focus)" : "var(--stroke-connector)",
          strokeWidth: selected ? 1.5 : 1,
          strokeDasharray: data.dotted ? "2.5 4" : undefined,
        }}
      />
      {(data.label || editing) && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "tidal-glass-pill nodrag nopan absolute max-w-[180px] px-[10px] py-2 text-center font-sans text-[13px] leading-[21px]",
              selected && "ring-1 ring-focus",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
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
    </>
  );
}
