import dagre from "@dagrejs/dagre";
import type { CardData, TidalEdgeT, TidalNode } from "./doc";
import type { Direction } from "./types";

const GROUP_HEADER = 41;
const GROUP_PAD = 28;

// Geist Mono at 14px is ~8.4px/char; Inter slightly narrower.
const MONO_CHAR = 8.45;
const SANS_CHAR = 7.2;

export type SizeOf = (node: TidalNode) => { width: number; height: number };

/** Char-count estimate, used at import before the DOM has measured anything. */
export function estimateSize(node: TidalNode): { width: number; height: number } {
  const data = node.data as CardData & { label?: string };
  if (node.type === "tidalCylinder") {
    return { width: 188, height: 170 };
  }
  if (node.type === "tidalPill") {
    return { width: (data.label ?? "").length * SANS_CHAR + 36, height: 37 };
  }
  if (node.type === "tidalGroup") {
    return { width: 360, height: 240 };
  }
  const header = data.header;
  const rows = data.rows ?? [];
  const widths = [
    header ? (header.title.length + (header.suffix?.length ?? 0)) * SANS_CHAR + 44 : 0,
    data.label ? Math.min(data.label.length, 28) * MONO_CHAR + 36 : 0,
    ...rows.map((r) => Math.max(r.label.length * SANS_CHAR, r.value.length * MONO_CHAR) + 36),
  ];
  const labelLines = data.label ? Math.ceil(data.label.length / 28) : 0;
  const height =
    (header ? 46 : 0) + rows.length * 68 + (data.label ? 14 + labelLines * 22 + 10 : 0);
  return {
    width: Math.max(...widths, header || rows.length ? 210 : 200),
    height: Math.max(height, 46),
  };
}

/** Prefer live measured dimensions, fall back to estimates. */
export const measuredOrEstimate: SizeOf = (node) =>
  node.measured?.width && node.measured?.height
    ? { width: node.measured.width, height: node.measured.height }
    : estimateSize(node);

/**
 * Dagre auto-layout. Returns a new node array with updated positions
 * (parent-relative) and group dimensions; never mutates inputs.
 */
export interface LayoutOpts {
  /** Gap within a rank (perpendicular to the flow). Default 48. */
  nodesep?: number;
  /** Gap between ranks (along the flow). Default 72. */
  ranksep?: number;
}

export function tidyLayout(
  nodes: TidalNode[],
  edges: TidalEdgeT[],
  direction: Direction,
  sizeOf: SizeOf,
  opts: LayoutOpts = {},
): TidalNode[] {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({
    rankdir: direction,
    nodesep: opts.nodesep ?? 48,
    ranksep: opts.ranksep ?? 72,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const groups = nodes.filter((n) => n.type === "tidalGroup");
  const plain = nodes.filter((n) => n.type !== "tidalGroup");

  for (const group of groups) {
    g.setNode(group.id, { width: 0, height: 0 });
    if (group.parentId) g.setParent(group.id, group.parentId);
  }
  for (const node of plain) {
    g.setNode(node.id, sizeOf(node));
    if (node.parentId) g.setParent(node.id, node.parentId);
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const label = edge.data?.label;
    g.setEdge(
      edge.source,
      edge.target,
      label ? { width: Math.min(label.length, 22) * SANS_CHAR + 36, height: 45, labelpos: "c" } : {},
      edge.id,
    );
  }

  dagre.layout(g);

  const groupRects = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const group of groups) {
    const n = g.node(group.id);
    if (!n) continue;
    groupRects.set(group.id, {
      x: n.x - n.width / 2 - GROUP_PAD,
      y: n.y - n.height / 2 - GROUP_PAD - GROUP_HEADER,
      width: n.width + GROUP_PAD * 2,
      height: n.height + GROUP_PAD * 2 + GROUP_HEADER,
    });
  }

  return nodes.map((node) => {
    const parentRect = node.parentId ? groupRects.get(node.parentId) : undefined;
    if (node.type === "tidalGroup") {
      const rect = groupRects.get(node.id);
      if (!rect) return node;
      return {
        ...node,
        position: { x: rect.x - (parentRect?.x ?? 0), y: rect.y - (parentRect?.y ?? 0) },
        style: { ...node.style, width: rect.width, height: rect.height },
      };
    }
    const n = g.node(node.id);
    if (!n) return node;
    return {
      ...node,
      position: {
        x: n.x - n.width / 2 - (parentRect?.x ?? 0),
        y: n.y - n.height / 2 - (parentRect?.y ?? 0),
      },
    };
  });
}

/** Bounding box (w/h) over top-level nodes — group rects already absorb their children. */
function contentBounds(nodes: TidalNode[], sizeOf: SizeOf): { width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (node.parentId) continue; // child positions are parent-relative; the group covers them
    const w = (node.style?.width as number) ?? sizeOf(node).width;
    const h = (node.style?.height as number) ?? sizeOf(node).height;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  }
  if (!isFinite(minX)) return { width: 1, height: 1 };
  return { width: maxX - minX, height: maxY - minY };
}

/**
 * Lay out, biasing the separations so the content bounding box approximates a
 * target aspect ratio (width / height). Dagre is content-driven and never
 * reflows ranks, so this is best-effort: it shifts the ratio of inter-rank to
 * intra-rank spacing and keeps the layout whose box is closest to target. A
 * pure linear chain has a fixed shape and won't move much; branching diagrams
 * respond well.
 */
export function layoutForAspect(
  nodes: TidalNode[],
  edges: TidalEdgeT[],
  direction: Direction,
  sizeOf: SizeOf,
  targetAspect: number,
): TidalNode[] {
  const flowHorizontal = direction === "LR" || direction === "RL";
  // Sweep the rank/node separation ratio. Larger `k` spreads ranks further
  // apart relative to within-rank spacing (wider for LR, taller for TB).
  const candidates = [0.18, 0.3, 0.5, 0.75, 1, 1.5, 2.25, 3.5, 5];
  const BASE = 60;
  const clamp = (v: number) => Math.max(20, Math.min(220, v));

  let best: TidalNode[] | null = null;
  let bestErr = Infinity;
  for (const k of candidates) {
    const ranksep = clamp(BASE * Math.sqrt(k));
    const nodesep = clamp(BASE / Math.sqrt(k));
    const laid = tidyLayout(nodes, edges, direction, sizeOf, {
      ranksep: flowHorizontal ? ranksep : nodesep,
      nodesep: flowHorizontal ? nodesep : ranksep,
    });
    const { width, height } = contentBounds(laid, sizeOf);
    const err = Math.abs(width / height - targetAspect);
    if (err < bestErr) {
      bestErr = err;
      best = laid;
    }
  }
  return best ?? tidyLayout(nodes, edges, direction, sizeOf);
}

/** Parse a "4:3" / "16/9" / "1.5" aspect string into width/height. Returns null if unusable. */
export function parseAspect(raw: string): number | null {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i);
  if (m) {
    const w = parseFloat(m[1]), h = parseFloat(m[2]);
    return h > 0 ? w / h : null;
  }
  const n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : null;
}
