import { MarkerType } from "@xyflow/react";
import {
  DOC_VERSION,
  migrateDoc,
  sortByParent,
  type CardData,
  type DiagramDoc,
  type TidalEdgeT,
  type TidalNode,
} from "./doc";
import { estimateSize, layoutForAspect, tidyLayout } from "./tidy";
import { NODE_COLORS } from "./nodeColors";
import type { DiagramSpec } from "./types";

export const EDGE_MARKER = {
  type: MarkerType.Arrow,
  width: 18,
  height: 18,
  color: "var(--stroke-connector)",
} as const;

/** Re-derive presentation fields that depend on the edge set / data. */
export function normalizeEdges(edges: TidalEdgeT[]): TidalEdgeT[] {
  const pairs = new Set(edges.map((e) => `${e.source}|${e.target}`));
  return edges.map((edge) => {
    // Tinted edges get a matching arrowhead (the hue's mid border shade reads in
    // both themes; the line stroke itself is theme-resolved in TidalEdge).
    const marker = edge.data?.color
      ? { ...EDGE_MARKER, color: NODE_COLORS[edge.data.color].border[1] }
      : EDGE_MARKER;
    return {
      ...edge,
      markerEnd: edge.data?.arrow ? marker : undefined,
      markerStart: edge.data?.arrowStart ? marker : undefined,
      data: {
        dotted: false,
        arrow: true,
        ...edge.data,
        // Keep an explicit curveOffset (e.g. sequence self-loops); otherwise bow
        // bidirectional pairs apart so they don't overlap.
        curveOffset: edge.data?.curveOffset ?? (pairs.has(`${edge.target}|${edge.source}`) ? 36 : 0),
      },
    };
  });
}

export interface SpecToDocOpts {
  /** Bias the layout toward this content aspect ratio (width / height), best-effort. */
  aspect?: number;
}

/** Convert a parsed Mermaid spec into a positioned document. */
export function specToDoc(
  spec: DiagramSpec,
  title = "Imported diagram",
  opts: SpecToDocOpts = {},
): DiagramDoc {
  const nodes: TidalNode[] = [
    ...spec.groups.map(
      (group): TidalNode => ({
        id: group.id,
        type: "tidalGroup",
        position: { x: 0, y: 0 },
        data: { label: group.label },
        zIndex: -1,
        ...(group.parent ? { parentId: group.parent } : {}),
      }),
    ),
    ...spec.nodes.map((node): TidalNode => {
      const type =
        node.shape === "cylinder" ? "tidalCylinder" : node.shape === "pill" ? "tidalPill" : "tidalCard";
      const data =
        type === "tidalCard"
          ? ({
              ...(node.subtitle
                ? { header: { title: node.label }, label: node.subtitle }
                : { label: node.label }),
              rows: [],
              ...(node.fill ? { fill: node.fill } : {}),
            } satisfies CardData)
          : type === "tidalCylinder"
            ? { label: node.label, ...(node.fill ? { fill: node.fill } : {}) }
            : { label: node.label };
      return {
        id: node.id,
        type,
        position: { x: 0, y: 0 },
        data,
        ...(node.parent ? { parentId: node.parent } : {}),
      };
    }),
  ];

  const edges: TidalEdgeT[] = spec.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "tidal",
    data: { label: edge.label, dotted: edge.dotted, arrow: edge.arrow, arrowStart: edge.arrowStart },
  }));

  const sorted = sortByParent(nodes);
  const positioned = opts.aspect
    ? layoutForAspect(sorted, edges, spec.direction, estimateSize, opts.aspect)
    : tidyLayout(sorted, edges, spec.direction, estimateSize);
  return {
    meta: { version: DOC_VERSION, title, direction: spec.direction },
    nodes: positioned,
    edges: normalizeEdges(edges),
  };
}

export function docToJson(doc: DiagramDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function jsonToDoc(json: string): DiagramDoc {
  const raw = JSON.parse(json) as Partial<DiagramDoc>;
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges) || !raw.meta?.version) {
    throw new Error("Not a Tidal Diagrams document");
  }
  for (const n of raw.nodes) {
    if (typeof n.id !== "string" || !n.position || typeof n.type !== "string") {
      throw new Error("Malformed node in document");
    }
  }
  const doc = migrateDoc(raw as DiagramDoc);
  return {
    ...doc,
    // a file import is a new document — never adopt the file's library identity
    meta: { ...doc.meta, docId: undefined },
    nodes: sortByParent(doc.nodes),
    edges: normalizeEdges(doc.edges),
  };
}
