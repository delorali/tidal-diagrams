import { useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@liquidai/react";
import type { CardData, CylinderData, GroupData, PillData } from "./doc";
import { nodeColorVars } from "./nodeColors";
import { useDiagramStore } from "./store";
import { NodePlus } from "./NodePlusToolbar";

function Ports() {
  // Loose connection mode: one handle per side, visible on hover, usable both ways.
  return (
    <>
      {(["l", "r", "t", "b"] as const).map((side) => (
        <Handle
          key={side}
          type="source"
          position={{ l: Position.Left, r: Position.Right, t: Position.Top, b: Position.Bottom }[side]}
          id={side}
          className="tidal-port"
        />
      ))}
    </>
  );
}

function InlineText({
  value,
  placeholder = "…",
  onCommit,
  className,
}: {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft !== value) onCommit(draft);
    };
    return (
      <input
        ref={ref}
        className={cn("nodrag bg-transparent outline-none ring-1 ring-focus rounded-sm px-0.5 -mx-0.5", className)}
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
    );
  }
  return (
    <span
      className={cn("cursor-text", !value && "opacity-40", className)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
    >
      {value || placeholder}
    </span>
  );
}

/** Composable card: optional header band, divider-separated rows, mono body label. */
export function TidalCardNode({ id, data, selected, width, height }: NodeProps) {
  const { header, label, rows = [], fill = "solid", color } = data as CardData;
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  // Per-axis: a fixed (resized) axis fills the wrapper; a hugging axis sizes to
  // content. Width also lifts the content max-width cap so it can grow past 320px.
  const fixedW = width != null;
  const fixedH = height != null;

  return (
    <div
      className="tidal-diagram-card"
      data-fill={fill}
      {...(color ? { "data-color": "" } : {})}
      style={{
        ...(fixedW ? { width: "100%", maxWidth: "none" } : {}),
        ...(fixedH ? { height: "100%" } : {}),
        ...(color ? nodeColorVars(color) : {}),
      }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={200}
        minHeight={44}
        lineClassName="!border-focus"
        handleClassName="!bg-card !border-focus"
      />
      {header && (
        <div className="flex items-baseline gap-1.5 px-4 py-3 text-left font-sans text-sm leading-[20px]">
          <InlineText
            value={header.title}
            placeholder="Title"
            className="font-medium text-foreground"
            onCommit={(title) => updateNodeData(id, (d) => ({ ...d, header: { ...d.header!, title } }))}
          />
          {header.suffix !== undefined && (
            <InlineText
              value={header.suffix}
              placeholder="Suffix"
              className="text-muted-foreground"
              onCommit={(suffix) => updateNodeData(id, (d) => ({ ...d, header: { ...d.header!, suffix } }))}
            />
          )}
        </div>
      )}
      {rows.map((row) => (
        <div key={row.id} className="border-t border-border px-4 py-2.5 text-left">
          <div className="font-sans text-[13px] leading-[20px] text-muted-foreground">
            <InlineText
              value={row.label}
              placeholder="Label"
              onCommit={(v) =>
                updateNodeData(id, (d) => ({
                  ...d,
                  rows: d.rows.map((r) => (r.id === row.id ? { ...r, label: v } : r)),
                }))
              }
            />
          </div>
          <div className="tidal-mono text-sm leading-[22px] text-foreground">
            <InlineText
              value={row.value}
              placeholder="Value"
              onCommit={(v) =>
                updateNodeData(id, (d) => ({
                  ...d,
                  rows: d.rows.map((r) => (r.id === row.id ? { ...r, value: v } : r)),
                }))
              }
            />
          </div>
        </div>
      ))}
      {label !== undefined && (
        <div
          className={cn(
            "tidal-mono px-4 text-sm leading-[22px] text-foreground",
            header || rows.length ? "pb-3 pt-0 text-left text-[13px] text-foreground/80" : "py-3 text-center",
            rows.length > 0 && "border-t border-border pt-2.5 pb-3",
          )}
        >
          <InlineText value={label} placeholder="Label" onCommit={(v) => updateNodeData(id, { label: v })} />
        </div>
      )}
      <Ports />
      <NodePlus nodeId={id} selected={!!selected} />
    </div>
  );
}

/** Glass pill, same treatment as edge labels but as a standalone node. */
export function TidalPillNode({ id, selected, data, width, height }: NodeProps) {
  const { label, color } = data as PillData;
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  return (
    <div
      className="tidal-glass-pill flex items-center justify-center px-[10px] py-2 text-center font-sans text-[13px] leading-[21px]"
      {...(color ? { "data-color": "" } : {})}
      style={{
        ...(width != null ? { width: "100%" } : {}),
        ...(height != null ? { height: "100%" } : {}),
        ...(color ? nodeColorVars(color) : {}),
      }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={56}
        minHeight={32}
        lineClassName="!border-focus"
        handleClassName="!bg-card !border-focus"
      />
      <InlineText value={label} onCommit={(v) => updateNodeData(id, { label: v })} />
      <Ports />
      <NodePlus nodeId={id} selected={!!selected} />
    </div>
  );
}

/** Database cylinder with stacked-disk arcs, drawn in SVG. */
export function TidalCylinderNode({ id, selected, data, width, height }: NodeProps) {
  const { label, fill = "solid", color } = data as CylinderData;
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  const w = width ?? 188;
  const h = height ?? 170;
  const ry = Math.min(33, h / 4); // disk depth scales down on short cylinders
  // Fills are CSS-driven (via data-fill / data-color) so color + dark mode work
  // the same way as cards. The silhouette stroke always stays.
  return (
    <div
      className="relative tidal-cylinder-node"
      data-fill={fill}
      {...(color ? { "data-color": "" } : {})}
      style={{ width: w, height: h, ...(color ? nodeColorVars(color) : {}) }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={120}
        minHeight={90}
        keepAspectRatio={false}
        lineClassName="!border-focus"
        handleClassName="!bg-card !border-focus"
      />
      <svg width={w} height={h} className="tidal-cylinder absolute inset-0 overflow-visible">
        <path
          d={`M1 ${ry} v${h - ry * 2} a${w / 2 - 1} ${ry} 0 0 0 ${w - 2} 0 v-${h - ry * 2}`}
          className="cyl-body"
        />
        <ellipse cx={w / 2} cy={ry} rx={w / 2 - 1} ry={ry - 1} className="cyl-top" />
        <path d={`M1 ${h * 0.42} a${w / 2 - 1} ${ry} 0 0 0 ${w - 2} 0`} className="cyl-arc" />
        <path d={`M1 ${h * 0.62} a${w / 2 - 1} ${ry} 0 0 0 ${w - 2} 0`} className="cyl-arc" />
      </svg>
      <div className="absolute inset-x-4 top-[40%] flex -translate-y-1/2 items-center justify-center text-center font-sans text-sm font-medium leading-[17px] text-foreground">
        <InlineText value={label} onCommit={(v) => updateNodeData(id, { label: v })} />
      </div>
      <Ports />
      <NodePlus nodeId={id} selected={!!selected} />
    </div>
  );
}

/** Container with header row + divider (Figma "Edge devices" / "Pipette Backend" pattern). */
export function TidalGroupNode({ id, data, selected }: NodeProps) {
  const { label } = data as GroupData;
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  return (
    <div className="tidal-diagram-group">
      <NodeResizer isVisible={!!selected} minWidth={160} minHeight={120} lineClassName="!border-focus" handleClassName="!bg-card !border-focus" />
      <div className="flex h-[41px] items-center border-b border-border px-4 font-sans text-[13px] font-medium text-foreground">
        <InlineText value={label} placeholder="Group" onCommit={(v) => updateNodeData(id, { label: v })} />
      </div>
    </div>
  );
}

/**
 * Invisible attachment point for sequence-diagram lifelines and messages.
 * Has zero visual footprint and ignores pointer events; the single loose-mode
 * handle just lets the floating TidalEdge resolve its endpoints from node bounds.
 */
export function TidalAnchorNode() {
  return (
    <div style={{ width: 1, height: 1, pointerEvents: "none" }}>
      <Handle type="source" position={Position.Top} id="c" style={{ opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1, border: 0 }} />
    </div>
  );
}

/**
 * Sequence-diagram activation bar — a thin vertical block on a lifeline marking
 * the span a participant is active. Sized entirely by the node's style.
 */
export function TidalActivationNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-[3px] border bg-muted",
        selected ? "border-focus" : "border-border",
      )}
    />
  );
}
