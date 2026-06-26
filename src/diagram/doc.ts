import type { Edge, Node } from "@xyflow/react";
import type { NodeColor } from "./nodeColors";

export const DOC_VERSION = 1;

export interface RowData {
  id: string;
  label: string;
  value: string;
}

/** Constrained surface treatment for a node — not free-form fill. */
export type NodeFill = "solid" | "outline" | "ghost";

export interface CardData extends Record<string, unknown> {
  header?: { title: string; suffix?: string };
  label?: string;
  rows: RowData[];
  /** Surface treatment; defaults to "solid". */
  fill?: NodeFill;
  /** Optional Tailwind-hue tint; undefined keeps the default Tidal styling. */
  color?: NodeColor;
}

export interface PillData extends Record<string, unknown> {
  label: string;
  /** Optional Tailwind-hue tint. */
  color?: NodeColor;
}

export interface CylinderData extends Record<string, unknown> {
  label: string;
  /** Surface treatment; defaults to "solid". */
  fill?: NodeFill;
  /** Optional Tailwind-hue tint. */
  color?: NodeColor;
}

export interface GroupData extends Record<string, unknown> {
  label: string;
}

/** Invisible sequence-diagram attachment point; carries no presentation data. */
export type AnchorData = Record<string, unknown>;

/** Sequence-diagram activation bar; sized via node style, no data of its own. */
export type ActivationData = Record<string, unknown>;

export interface EdgeData extends Record<string, unknown> {
  label?: string;
  dotted: boolean;
  /** Arrowhead at the target end. */
  arrow: boolean;
  /** Arrowhead at the source end (for "both" / reversed styles). */
  arrowStart?: boolean;
  /** Set at import for bidirectional pairs; bows the curve sideways. */
  curveOffset?: number;
  /** Sequence-message label: rendered as plain text above the line, not a pill. */
  seqLabel?: boolean;
  /** Optional Tailwind-hue tint for the stroke + label. */
  color?: NodeColor;
  /** Freeform routing points (flow coords). When present the edge is a polyline
   * through these instead of a bezier; endpoints attach facing the nearest point. */
  waypoints?: { x: number; y: number }[];
}

export type TidalNodeType =
  | "tidalCard"
  | "tidalPill"
  | "tidalCylinder"
  | "tidalGroup"
  | "tidalAnchor"
  | "tidalActivation";

/** Node types a user can spawn/convert — excludes internal sequence primitives. */
export type CreatableNodeType = Exclude<TidalNodeType, "tidalAnchor" | "tidalActivation">;

export type TidalNode = Node<CardData | PillData | CylinderData | GroupData | AnchorData | ActivationData>;
export type TidalEdgeT = Edge<EdgeData>;

export interface DocMeta {
  version: number;
  title: string;
  /** Preferred flow direction, used by the Tidy action. */
  direction: "LR" | "TB" | "RL" | "BT";
  /** Identity in the local diagram library. */
  docId?: string;
}

export interface DiagramDoc {
  meta: DocMeta;
  nodes: TidalNode[];
  edges: TidalEdgeT[];
}

export const newId = () => crypto.randomUUID().slice(0, 8);

export function createNode(type: CreatableNodeType, position: { x: number; y: number }): TidalNode {
  const base = { id: newId(), position, type };
  switch (type) {
    case "tidalCard":
      return { ...base, data: { label: "Node", rows: [] } satisfies CardData };
    case "tidalPill":
      return { ...base, data: { label: "Label" } satisfies PillData };
    case "tidalCylinder":
      return { ...base, data: { label: "Database" } satisfies CylinderData };
    case "tidalGroup":
      return {
        ...base,
        data: { label: "Group" } satisfies GroupData,
        style: { width: 360, height: 240 },
        zIndex: -1,
      };
  }
}

export function createEdge(
  source: string,
  target: string,
  data: Partial<EdgeData> = {},
  handles: { sourceHandle?: string; targetHandle?: string } = {},
): TidalEdgeT {
  return {
    id: `e-${newId()}`,
    source,
    target,
    type: "tidal",
    ...handles,
    data: { dotted: false, arrow: true, ...data },
  };
}

function omit<T extends object>(obj: T, keys: readonly string[]): T {
  const copy = { ...obj } as Record<string, unknown>;
  for (const k of keys) delete copy[k];
  return copy as T;
}

/**
 * Drop interaction state so history/persistence only see document state.
 * `measured` is deliberately KEPT: restoring nodes without it forces React Flow
 * to re-measure, and the resulting change events would churn right after undo.
 */
export function stripEphemeral(nodes: TidalNode[], edges: TidalEdgeT[]) {
  return {
    nodes: nodes.map((n) => omit(n, ["selected", "dragging", "resizing"])),
    edges: edges.map((e) => omit(e, ["selected"])),
  };
}

/** Stricter strip for JSON file export. */
export function stripForExport(nodes: TidalNode[], edges: TidalEdgeT[]) {
  const base = stripEphemeral(nodes, edges);
  return { ...base, nodes: base.nodes.map((n) => omit(n, ["measured"])) };
}

/** Parents must precede children in React Flow's node array. */
export function sortByParent(nodes: TidalNode[]): TidalNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: TidalNode[] = [];
  const visiting = new Set<string>();
  const visit = (n: TidalNode) => {
    if (out.includes(n) || visiting.has(n.id)) return;
    visiting.add(n.id);
    if (n.parentId) {
      const p = byId.get(n.parentId);
      if (p) visit(p);
    }
    visiting.delete(n.id);
    out.push(n);
  };
  nodes.forEach(visit);
  return out;
}

export function migrateDoc(doc: DiagramDoc): DiagramDoc {
  // version 1 is current; future migrations switch on doc.meta.version here
  return { ...doc, meta: { ...doc.meta, version: DOC_VERSION } };
}
