import {
  type CardData,
  type CylinderData,
  type DiagramDoc,
  type GroupData,
  type NodeFill,
  type PillData,
  type TidalEdgeT,
  type TidalNode,
  newId,
} from "./doc";
import { normalizeEdges } from "./io";
import { slug } from "./quicktext";
import type { DiagramSpec, SpecNode } from "./types";

/** The text-identity of a doc node: slug of its title (cards) or label. */
export function nodeSlug(n: TidalNode): string {
  if (n.type === "tidalCard") {
    const d = n.data as CardData;
    return slug(d.header?.title ?? d.label ?? "");
  }
  return slug((n.data as { label?: string }).label ?? "");
}

function specType(shape: SpecNode["shape"]): TidalNode["type"] {
  return shape === "cylinder" ? "tidalCylinder" : shape === "pill" ? "tidalPill" : "tidalCard";
}

/** Build node data from a spec node, preserving inspector-only fields (rows, suffix). */
function buildData(
  type: TidalNode["type"],
  sn: SpecNode,
  prev: TidalNode["data"] | undefined,
): TidalNode["data"] {
  if (type === "tidalCard") {
    const prevCard = prev as CardData | undefined;
    const fill = sn.fill ?? prevCard?.fill;
    if (sn.subtitle) {
      return {
        header: { title: sn.label, ...(prevCard?.header?.suffix ? { suffix: prevCard.header.suffix } : {}) },
        label: sn.subtitle,
        rows: prevCard?.rows ?? [],
        ...(fill ? { fill } : {}),
      } satisfies CardData;
    }
    return { label: sn.label, rows: prevCard?.rows ?? [], ...(fill ? { fill } : {}) } satisfies CardData;
  }
  if (type === "tidalCylinder") {
    const fill = sn.fill ?? (prev as CylinderData | undefined)?.fill;
    return { label: sn.label, ...(fill ? { fill } : {}) } satisfies CylinderData;
  }
  return { label: sn.label } satisfies PillData;
}

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bboxOf(nodes: { position: { x: number; y: number }; width?: number; height?: number }[]): Bbox {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + (n.width ?? 200));
    maxY = Math.max(maxY, n.position.y + (n.height ?? 56));
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Reconcile parsed Quick-text into the existing document, matching nodes by
 * label-slug so manual positions (and inspector-only rows/suffix) survive edits.
 * Only genuinely new nodes are auto-placed.
 */
export function reconcileQuickText(spec: DiagramSpec, prev: DiagramDoc): { nodes: TidalNode[]; edges: TidalEdgeT[] } {
  const prevBySlug = new Map<string, TidalNode>();
  for (const n of prev.nodes) prevBySlug.set(nodeSlug(n), n);

  const groupDocId = new Map<string, string>(); // spec group id -> doc id
  const slugToDocId = new Map<string, string>(); // node slug -> doc id (for edge resolution)
  const out: TidalNode[] = [];
  const isNew = new Set<string>();

  // groups first (parents precede children)
  for (const g of spec.groups) {
    const s = slug(g.label);
    const match = prevBySlug.get(s);
    const parentId = g.parent ? groupDocId.get(g.parent) : undefined;
    if (match && match.type === "tidalGroup") {
      groupDocId.set(g.id, match.id);
      out.push({ ...match, data: { label: g.label } satisfies GroupData, parentId });
    } else {
      const id = newId();
      groupDocId.set(g.id, id);
      isNew.add(id);
      out.push({
        id,
        type: "tidalGroup",
        position: { x: 0, y: 0 },
        data: { label: g.label } satisfies GroupData,
        zIndex: -1,
        style: { width: 320, height: 220 },
        ...(parentId ? { parentId } : {}),
      });
    }
  }

  // plain nodes
  for (const sn of spec.nodes) {
    const type = specType(sn.shape);
    const match = prevBySlug.get(sn.id);
    const parentId = sn.parent ? groupDocId.get(sn.parent) : undefined;
    if (match && match.type === type) {
      slugToDocId.set(sn.id, match.id);
      const sameParent = (match.parentId ?? undefined) === (parentId ?? undefined);
      out.push({
        ...match,
        data: buildData(type, sn, match.data),
        parentId,
        ...(sameParent ? {} : { position: { x: 0, y: 0 } }), // moved groups → re-place
      });
      if (!sameParent) isNew.add(match.id);
    } else {
      const id = newId();
      slugToDocId.set(sn.id, id);
      isNew.add(id);
      out.push({
        id,
        type,
        position: { x: 0, y: 0 },
        data: buildData(type, sn, undefined),
        ...(parentId ? { parentId } : {}),
      });
    }
  }

  placeNewNodes(out, spec, slugToDocId, isNew, prev.meta.direction);

  const edges = normalizeEdges(
    spec.edges
      .filter((e) => slugToDocId.has(e.source) && slugToDocId.has(e.target))
      .map((e) => ({
        id: `e-${newId()}`,
        source: slugToDocId.get(e.source)!,
        target: slugToDocId.get(e.target)!,
        type: "tidal" as const,
        data: { label: e.label, dotted: e.dotted, arrow: e.arrow, arrowStart: e.arrowStart },
      })),
  );

  return { nodes: out, edges };
}

function placeNewNodes(
  nodes: TidalNode[],
  spec: DiagramSpec,
  slugToDocId: Map<string, string>,
  isNew: Set<string>,
  direction: string,
) {
  const horizontal = direction === "LR" || direction === "RL";
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // adjacency among placed (existing) nodes for neighbor-based placement
  const neighborOf = (docId: string): TidalNode | undefined => {
    for (const e of spec.edges) {
      const s = slugToDocId.get(e.source);
      const t = slugToDocId.get(e.target);
      if (s === docId && t && !isNew.has(t)) return byId.get(t);
      if (t === docId && s && !isNew.has(s)) return byId.get(s);
    }
    return undefined;
  };

  // top-level placement frame
  const placedTop = nodes.filter((n) => !isNew.has(n.id) && !n.parentId && n.type !== "tidalGroup");
  const frame = bboxOf(placedTop.map((n) => ({ position: n.position, width: n.measured?.width, height: n.measured?.height })));
  let topStack = 0;

  // group child placement: stack within each group
  const groupChildCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentId && !isNew.has(n.id)) {
      groupChildCount.set(n.parentId, (groupChildCount.get(n.parentId) ?? 0) + 1);
    }
  }

  for (const n of nodes) {
    if (!isNew.has(n.id) || n.type === "tidalGroup") continue;
    if (n.parentId) {
      const i = groupChildCount.get(n.parentId) ?? 0;
      groupChildCount.set(n.parentId, i + 1);
      n.position = { x: 24, y: 52 + i * 84 };
    } else {
      const nb = neighborOf(n.id);
      if (nb) {
        n.position = horizontal
          ? { x: nb.position.x + (nb.measured?.width ?? 200) + 120, y: nb.position.y }
          : { x: nb.position.x, y: nb.position.y + (nb.measured?.height ?? 56) + 100 };
      } else {
        n.position = { x: frame.maxX + 120, y: frame.minY + topStack * 110 };
        topStack++;
      }
    }
  }

  // size new groups to fit their children
  for (const g of nodes) {
    if (g.type !== "tidalGroup" || !isNew.has(g.id)) continue;
    const children = nodes.filter((c) => c.parentId === g.id);
    const cb = bboxOf(children.map((c) => ({ position: c.position, width: c.measured?.width ?? 210, height: c.measured?.height ?? 60 })));
    g.position = { x: frame.maxX + 120, y: frame.minY + topStack * 110 };
    topStack += 3;
    g.style = {
      ...g.style,
      width: Math.max(320, cb.maxX + 24),
      height: Math.max(220, cb.maxY + 24),
    };
  }
}

// ---------------------------------------------------------------------------
// Serialization: doc -> Quick-text
// ---------------------------------------------------------------------------

const DIR_WORD: Record<string, string> = { LR: "right", TB: "down", RL: "left", BT: "up" };

function nodeLabelText(n: TidalNode): string {
  if (n.type === "tidalCard") {
    const d = n.data as CardData;
    const title = d.header?.title ?? d.label ?? "";
    const body = d.header && d.label !== undefined ? d.label : undefined;
    return body ? `${title} / ${body}` : title;
  }
  return (n.data as { label?: string }).label ?? "";
}

function refLabel(n: TidalNode): string {
  // The token used in edge lines — title for cards, label otherwise.
  if (n.type === "tidalCard") {
    const d = n.data as CardData;
    return d.header?.title ?? d.label ?? "";
  }
  return (n.data as { label?: string }).label ?? "";
}

function tagsFor(n: TidalNode): string {
  const out: string[] = [];
  if (n.type === "tidalCylinder") out.push("#db");
  if (n.type === "tidalPill") out.push("#pill");
  const fill = (n.data as { fill?: NodeFill }).fill;
  if (fill && fill !== "solid") out.push(`#${fill}`);
  return out.length ? " " + out.join(" ") : "";
}

function edgeOp(e: TidalEdgeT): string {
  const d = e.data ?? { dotted: false, arrow: true };
  const both = !!d.arrowStart && !!d.arrow;
  if (both) return d.dotted ? "<..>" : "<->";
  if (d.arrow) return d.dotted ? "..>" : "->";
  return d.dotted ? ".." : "--";
}

export function docToQuickText(doc: DiagramDoc): string {
  const lines: string[] = [];
  if (doc.meta.direction !== "LR") lines.push(`direction: ${DIR_WORD[doc.meta.direction] ?? "right"}`);
  if (lines.length) lines.push("");

  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const declared = new Set<string>();

  // degree, to know which plain cards can be left implicit
  const degree = new Map<string, number>();
  for (const e of doc.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const needsDeclaration = (n: TidalNode): boolean => {
    if (n.type !== "tidalCard") return true; // db/pill carry a shape tag
    const d = n.data as CardData;
    if (d.header || d.fill) return true; // title/body or fill
    return (degree.get(n.id) ?? 0) === 0; // isolated card
  };

  // groups with their children
  const groups = doc.nodes.filter((n) => n.type === "tidalGroup");
  const childrenOf = (gid: string) => doc.nodes.filter((n) => n.parentId === gid && n.type !== "tidalGroup");
  const emitGroup = (g: TidalNode, depth: number) => {
    const pad = "  ".repeat(depth);
    lines.push(`${pad}${(g.data as GroupData).label}:`);
    for (const c of childrenOf(g.id)) {
      lines.push(`${pad}  ${nodeLabelText(c)}${tagsFor(c)}`);
      declared.add(c.id);
    }
    for (const sub of groups.filter((x) => x.parentId === g.id)) emitGroup(sub, depth + 1);
    declared.add(g.id);
  };
  for (const g of groups.filter((x) => !x.parentId)) emitGroup(g, 0);

  // top-level node declarations (only where needed)
  const topNodes = doc.nodes.filter((n) => n.type !== "tidalGroup" && !n.parentId && !declared.has(n.id));
  let wroteDecl = false;
  for (const n of topNodes) {
    if (needsDeclaration(n)) {
      if (groups.length && !wroteDecl) lines.push("");
      lines.push(`${nodeLabelText(n)}${tagsFor(n)}`);
      declared.add(n.id);
      wroteDecl = true;
    }
  }

  // edges
  if (doc.edges.length) lines.push("");
  for (const e of doc.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const label = e.data?.label ? `|${e.data.label}|` : "";
    lines.push(`${refLabel(s)} ${edgeOp(e)}${label} ${refLabel(t)}`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
