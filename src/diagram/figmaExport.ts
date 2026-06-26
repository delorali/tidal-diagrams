import type { CardData, CylinderData, DiagramDoc, GroupData, PillData, TidalEdgeT, TidalNode } from "./doc";
import { NODE_COLORS, type NodeColor } from "./nodeColors";
import { measuredOrEstimate } from "./tidy";

/**
 * A flattened, self-contained description of a diagram for rebuilding it as
 * editable layers in Figma (design mode). All geometry is in absolute canvas
 * coordinates and all colors are pre-resolved to light-theme hex, so the Figma
 * builder needs none of the app's layout or theming logic.
 */
export interface FigmaNodeSpec {
  id: string;
  kind: "card" | "pill" | "cylinder" | "group";
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  header?: string;
  subtitle?: string;
  rows?: { label: string; value: string }[];
  parent?: string;
  /** Card body labels render in Geist Mono (matches the app); headers stay sans. */
  mono?: boolean;
  /** Resolved light-theme paints; omit for none (ghost has no fill/stroke). */
  fillHex?: string;
  strokeHex?: string;
  textHex: string;
}

export interface FigmaEdgeSpec {
  source: string;
  target: string;
  label?: string;
  dotted: boolean;
  arrow: boolean;
  arrowStart?: boolean;
  strokeHex: string;
}

export interface FigmaSpec {
  title: string;
  direction: string;
  nodes: FigmaNodeSpec[];
  edges: FigmaEdgeSpec[];
}

// Resolved light-theme Liquid tokens (see src/index.css + @liquidai/tokens).
const DEFAULT_FILL = "#fafafa"; // --surface-raised (node fill)
const DEFAULT_STROKE = "#e8e8e8"; // --border-default rgba(0,0,0,.08) flattened on white
const DEFAULT_TEXT = "#171717"; // --foreground
const MUTED_TEXT = "#737373"; // --foreground-muted
const CONNECTOR = "#c7c7c7"; // --stroke-connector

type Treatment = "solid" | "outline" | "ghost";

/** Resolve a node's surface treatment + optional hue into light-theme paints. */
function paints(fill: Treatment | undefined, color: NodeColor | undefined) {
  const treatment = fill ?? "solid";
  const shades = color ? NODE_COLORS[color] : undefined;
  if (treatment === "ghost") {
    return { textHex: shades ? shades.ghost[0] : DEFAULT_TEXT };
  }
  const strokeHex = shades ? shades.border[0] : DEFAULT_STROKE;
  if (treatment === "outline") {
    return { fillHex: DEFAULT_FILL, strokeHex, textHex: shades ? shades.ghost[0] : DEFAULT_TEXT };
  }
  // solid
  return {
    fillHex: shades ? shades.fill[0] : DEFAULT_FILL,
    strokeHex,
    textHex: shades ? shades.ghost[0] : DEFAULT_TEXT,
  };
}

/** Build the flattened Figma spec from a live diagram (store nodes/edges + meta). */
export function docToFigmaSpec(
  nodes: TidalNode[],
  edges: TidalEdgeT[],
  meta: DiagramDoc["meta"],
): FigmaSpec {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // React Flow positions are parent-relative; resolve to absolute canvas coords.
  const absCache = new Map<string, { x: number; y: number }>();
  const abs = (n: TidalNode): { x: number; y: number } => {
    const cached = absCache.get(n.id);
    if (cached) return cached;
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const base = parent ? abs(parent) : { x: 0, y: 0 };
    const pos = { x: base.x + n.position.x, y: base.y + n.position.y };
    absCache.set(n.id, pos);
    return pos;
  };

  const included = new Set<string>();
  const specNodes: FigmaNodeSpec[] = [];
  for (const n of nodes) {
    if (n.type === "tidalAnchor" || n.type === "tidalActivation") continue; // sequence internals
    const { x, y } = abs(n);

    if (n.type === "tidalGroup") {
      const w = (n.style?.width as number) ?? 360;
      const h = (n.style?.height as number) ?? 240;
      included.add(n.id);
      specNodes.push({
        id: n.id, kind: "group", x, y, w, h,
        label: (n.data as GroupData).label ?? "",
        ...(n.parentId ? { parent: n.parentId } : {}),
        strokeHex: DEFAULT_STROKE, textHex: DEFAULT_TEXT,
      });
      continue;
    }

    const { width: w, height: h } = measuredOrEstimate(n);
    included.add(n.id);
    if (n.type === "tidalPill") {
      const d = n.data as PillData;
      specNodes.push({
        id: n.id, kind: "pill", x, y, w, h, label: d.label ?? "",
        ...(n.parentId ? { parent: n.parentId } : {}),
        ...paints("solid", d.color),
        textHex: d.color ? NODE_COLORS[d.color].ghost[0] : MUTED_TEXT, // glass-pill text is muted
      });
    } else if (n.type === "tidalCylinder") {
      const d = n.data as CylinderData;
      specNodes.push({
        id: n.id, kind: "cylinder", x, y, w, h, label: d.label ?? "",
        ...(n.parentId ? { parent: n.parentId } : {}),
        ...paints(d.fill, d.color),
      });
    } else {
      const d = n.data as CardData;
      specNodes.push({
        id: n.id, kind: "card", x, y, w, h,
        label: d.label ?? "",
        mono: true,
        ...(d.header ? { header: `${d.header.title}${d.header.suffix ?? ""}` } : {}),
        ...(d.rows?.length ? { rows: d.rows.map((r) => ({ label: r.label, value: r.value })) } : {}),
        ...(n.parentId ? { parent: n.parentId } : {}),
        ...paints(d.fill, d.color),
      });
    }
  }

  const specEdges: FigmaEdgeSpec[] = edges
    .filter((e) => included.has(e.source) && included.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      ...(e.data?.label ? { label: e.data.label } : {}),
      dotted: !!e.data?.dotted,
      arrow: e.data?.arrow ?? true,
      ...(e.data?.arrowStart ? { arrowStart: true } : {}),
      strokeHex: e.data?.color ? NODE_COLORS[e.data.color].border[0] : CONNECTOR,
    }));

  return { title: meta.title, direction: meta.direction, nodes: specNodes, edges: specEdges };
}

/** Clipboard payload: the slash command (with a URL placeholder) + the spec JSON. */
export function figmaClipboardPayload(spec: FigmaSpec): string {
  return [
    "/diagram-to-figma <PASTE YOUR FIGMA DESIGN PAGE URL HERE>",
    "",
    "```json",
    JSON.stringify(spec),
    "```",
    "",
  ].join("\n");
}
