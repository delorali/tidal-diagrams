import type { NodeFill } from "./doc";
import type { Direction, DiagramSpec, NodeShape, SpecEdge, SpecGroup, SpecNode } from "./types";
import { detectUnsupportedDiagramType, unsupportedMessage, type UnsupportedDiagram } from "./diagramType";

export interface QuickTextDiagnostic {
  /** 0-based line number. */
  line: number;
  message: string;
  severity: "error" | "warning";
}

export interface QuickTextResult {
  spec: DiagramSpec;
  diagnostics: QuickTextDiagnostic[];
  /** Set when the source is a Mermaid diagram type Tidal can't render. */
  unsupported?: UnsupportedDiagram;
}

/** Stable id from a label's leading title segment, so references match declarations. */
export function slug(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return s || "n";
}

const DIRECTIONS: Record<string, Direction> = {
  lr: "LR", tb: "TB", rl: "RL", bt: "BT",
  right: "LR", down: "TB", left: "RL", up: "BT",
};

// Longest-first so e.g. "-->" matches before "->" and "<->" before "<-".
const OPS = ["<->", "<..>", "<..", "<-", "-.->", "-->", "->", "..>", "---", "--", ".."];
const OP_ALT = OPS.map((o) => o.replace(/[.\-<>]/g, (c) => "\\" + c)).join("|");
const LINK_RE = new RegExp(`\\s*(${OP_ALT})\\s*(?:\\|([^|]*)\\|)?\\s*`, "g");

interface LinkStyle {
  dotted: boolean;
  dir: "fwd" | "back" | "both" | "none";
}

function opStyle(op: string): LinkStyle {
  switch (op) {
    case "->":
    case "-->":
      return { dotted: false, dir: "fwd" };
    case "..>":
    case "-.->":
      return { dotted: true, dir: "fwd" };
    case "<-":
      return { dotted: false, dir: "back" };
    case "<..":
      return { dotted: true, dir: "back" };
    case "<->":
      return { dotted: false, dir: "both" };
    case "<..>":
      return { dotted: true, dir: "both" };
    case "--":
    case "---":
      return { dotted: false, dir: "none" };
    case "..":
      return { dotted: true, dir: "none" };
    default:
      return { dotted: false, dir: "fwd" };
  }
}

function leadingIndent(line: string): number {
  const m = line.match(/^[ \t]*/);
  let n = 0;
  for (const ch of m ? m[0] : "") n += ch === "\t" ? 4 : 1;
  return n;
}

export function parseQuickText(source: string): QuickTextResult {
  const diagnostics: QuickTextDiagnostic[] = [];

  // Guard: an unsupported Mermaid diagram type would otherwise be mangled into
  // a pile of disconnected nodes. Bail with a clear message and an empty spec.
  const unsupported = detectUnsupportedDiagramType(source);
  if (unsupported) {
    return {
      spec: { direction: "LR", nodes: [], edges: [], groups: [] },
      diagnostics: [{ line: 0, message: unsupportedMessage(unsupported), severity: "error" }],
      unsupported,
    };
  }

  const nodes = new Map<string, SpecNode>();
  const groups: SpecGroup[] = [];
  const edges: SpecEdge[] = [];
  let direction: Direction = "LR";
  let edgeSeq = 0;
  let groupSeq = 0;

  // Stack of open group headers by indent for outline nesting.
  const groupStack: { indent: number; id: string }[] = [];

  const lines = source.split("\n");

  /** Parse one node token ("Title / body #db #ghost @id") into / merged onto the registry. */
  function upsertNode(raw: string, lineNo: number, parent?: string): string | null {
    let text = raw.trim();
    if (!text) {
      diagnostics.push({ line: lineNo, message: "Empty node name", severity: "error" });
      return null;
    }

    // pull off trailing #tags and @id (only when not inside a quoted label)
    let shape: NodeShape = "card";
    let fill: NodeFill | undefined;
    let explicitId: string | undefined;
    const tagRe = /\s+([#@][\w-]+)$/;
    let m: RegExpMatchArray | null;
    while ((m = text.match(tagRe))) {
      const tag = m[1];
      if (tag === "#db") shape = "cylinder";
      else if (tag === "#pill") shape = "pill";
      else if (tag === "#card") shape = "card";
      else if (tag === "#solid" || tag === "#outline" || tag === "#ghost") fill = tag.slice(1) as NodeFill;
      else if (tag.startsWith("@")) explicitId = slug(tag.slice(1));
      else diagnostics.push({ line: lineNo, message: `Unknown tag "${tag}"`, severity: "warning" });
      text = text.slice(0, m.index).trimEnd();
    }

    // quoted label keeps special characters literally
    if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
      text = text.slice(1, -1);
    }

    // " / " splits title (header) from mono body
    const slashIdx = text.indexOf(" / ");
    const title = slashIdx >= 0 ? text.slice(0, slashIdx).trim() : text;
    const body = slashIdx >= 0 ? text.slice(slashIdx + 3).trim() : undefined;
    if (!title) {
      diagnostics.push({ line: lineNo, message: "Empty node name", severity: "error" });
      return null;
    }

    const id = explicitId ?? slug(title);
    const existing = nodes.get(id);
    const next: SpecNode = {
      id,
      label: title,
      ...(body ? { subtitle: body } : existing?.subtitle ? { subtitle: existing.subtitle } : {}),
      shape: shape !== "card" ? shape : existing?.shape ?? "card",
      ...(fill ?? existing?.fill ? { fill: fill ?? existing?.fill } : {}),
      ...(parent ?? existing?.parent ? { parent: parent ?? existing?.parent } : {}),
    };
    nodes.set(id, next);
    return id;
  }

  function endpoints(chunk: string, lineNo: number, parent?: string): string[] {
    return chunk
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => upsertNode(s, lineNo, parent))
      .filter((id): id is string => id !== null);
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    // direction directive
    const dirMatch = trimmed.match(/^(?:direction\s*:?\s*)?([A-Za-z]+)$/i);
    if (dirMatch && DIRECTIONS[dirMatch[1].toLowerCase()] && /^(direction|lr|tb|rl|bt|right|down|left|up)\b/i.test(trimmed)) {
      direction = DIRECTIONS[dirMatch[1].toLowerCase()];
      continue;
    }

    const indent = leadingIndent(rawLine);
    while (groupStack.length && indent <= groupStack[groupStack.length - 1].indent) groupStack.pop();
    const parent = groupStack.length ? groupStack[groupStack.length - 1].id : undefined;

    // edge line? (contains an operator)
    LINK_RE.lastIndex = 0;
    const hasOp = LINK_RE.test(trimmed);
    if (hasOp) {
      LINK_RE.lastIndex = 0;
      const endpointChunks: string[] = [];
      const links: LinkStyle[] = [];
      const labels: (string | undefined)[] = [];
      let last = 0;
      let mm: RegExpExecArray | null;
      while ((mm = LINK_RE.exec(trimmed))) {
        endpointChunks.push(trimmed.slice(last, mm.index));
        links.push(opStyle(mm[1]));
        labels.push(mm[2]?.trim() || undefined);
        last = LINK_RE.lastIndex;
      }
      endpointChunks.push(trimmed.slice(last));

      const groups2 = endpointChunks.map((c) => endpoints(c, i, parent));
      for (let k = 0; k < links.length; k++) {
        const from = groups2[k];
        const to = groups2[k + 1];
        if (!from.length || !to.length) {
          diagnostics.push({ line: i, message: "Edge is missing a node on one side", severity: "error" });
          continue;
        }
        const { dotted, dir } = links[k];
        const label = labels[k];
        for (const a of from) {
          for (const b of to) {
            const [s, t, arrow, arrowStart] =
              dir === "back"
                ? [b, a, true, false]
                : dir === "both"
                  ? [a, b, true, true]
                  : dir === "none"
                    ? [a, b, false, false]
                    : [a, b, true, false];
            edges.push({ id: `e${edgeSeq++}`, source: s, target: t, label, dotted, arrow, arrowStart });
          }
        }
      }
      continue;
    }

    // group header? (line ending in ":")
    if (trimmed.endsWith(":")) {
      const label = trimmed.slice(0, -1).trim();
      const id = `g${groupSeq++}-${slug(label)}`;
      groups.push({ id, label, ...(parent ? { parent } : {}) });
      groupStack.push({ indent, id });
      continue;
    }

    // plain node declaration
    upsertNode(trimmed, i, parent);
  }

  return {
    spec: { direction, nodes: [...nodes.values()], edges, groups },
    diagnostics,
  };
}
