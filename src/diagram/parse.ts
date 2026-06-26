import type { DiagramSpec, Direction, NodeShape, SpecEdge, SpecGroup, SpecNode } from "./types";
import { detectUnsupportedDiagramType, unsupportedMessage, type UnsupportedDiagram } from "./diagramType";

export interface ParseResult {
  spec: DiagramSpec;
  errors: string[];
  /** Set when the source is a Mermaid diagram type Tidal can't render. */
  unsupported?: UnsupportedDiagram;
}

/**
 * Parses a subset of Mermaid flowchart syntax:
 *
 *   flowchart LR                      direction (also `graph TD`, etc.)
 *   a[Label]                          card node
 *   a["Title<br/>Subtitle"]           two-line card (title + mono subtitle)
 *   a[(Database)]                     cylinder
 *   a([Label])                        pill
 *   a --> b                           solid arrow
 *   a -->|label| b                    labeled arrow
 *   a -- label --> b                  labeled arrow (inline form)
 *   a -.-> b   /  a -.->|label| b     dotted arrow
 *   a --- b    /  a -.- b             lines without arrowheads
 *   a --> b & c                       fan-out
 *   subgraph id [Title] ... end       container group
 *   %% comment
 */
export function parseMermaid(source: string): ParseResult {
  // Guard: refuse Mermaid diagram types we can't render rather than shredding
  // them into disconnected flowchart nodes.
  const unsupported = detectUnsupportedDiagramType(source);
  if (unsupported) {
    return {
      spec: { direction: "LR", nodes: [], edges: [], groups: [] },
      errors: [unsupportedMessage(unsupported)],
      unsupported,
    };
  }

  const errors: string[] = [];
  const nodes = new Map<string, SpecNode>();
  const groups: SpecGroup[] = [];
  const edges: SpecEdge[] = [];
  const groupStack: string[] = [];
  let direction: Direction = "LR";
  let edgeSeq = 0;

  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith("%%")) continue;
    line = line.replace(/;$/, "");

    // direction header
    const dir = line.match(/^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)?\s*$/i);
    if (dir) {
      const d = (dir[1] ?? "LR").toUpperCase();
      direction = (d === "TD" ? "TB" : d) as Direction;
      continue;
    }
    if (/^direction\s+/i.test(line)) continue; // per-subgraph direction: ignored

    // subgraph / end
    const sub = line.match(/^subgraph\s+(.+)$/i);
    if (sub) {
      const head = sub[1].trim();
      // forms: `id [Title]`, `id[Title]`, `Title`
      const withTitle = head.match(/^([\w.-]+)\s*\[\s*"?(.*?)"?\s*\]$/);
      const id = withTitle ? withTitle[1] : head.replace(/\W+/g, "_");
      const label = withTitle ? withTitle[2] : head.replace(/^"|"$/g, "");
      groups.push({ id, label, parent: groupStack[groupStack.length - 1] });
      groupStack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) {
      if (groupStack.length === 0) errors.push(`Line ${i + 1}: "end" without subgraph`);
      groupStack.pop();
      continue;
    }

    // ignored statements
    if (/^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/i.test(line)) continue;

    // edge or node statement
    if (!parseStatement(line)) {
      errors.push(`Line ${i + 1}: could not parse "${line}"`);
    }
  }

  if (groupStack.length > 0) errors.push(`Missing "end" for subgraph "${groupStack[groupStack.length - 1]}"`);

  return { spec: { direction, nodes: [...nodes.values()], edges, groups }, errors };

  /** Registers a node reference, creating/updating its definition. Returns ids (handles `a & b`). */
  function registerEndpoints(chunk: string): string[] | null {
    const parts = chunk.split(/\s*&\s*/).filter(Boolean);
    const ids: string[] = [];
    for (const part of parts) {
      const m = part.trim().match(
        // id, then optional shape: [(...)] | ([...]) | ((...)) | {...} | [...] | (...)
        /^([\w.-]+)\s*(?:\[\((.+)\)\]|\(\[(.+)\]\)|\(\((.+)\)\)|\{(.+)\}|\[(.+)\]|\((.+)\))?$/s,
      );
      if (!m) return null;
      const id = m[1];
      const cylinder = m[2];
      const pill = m[3] ?? m[4];
      const boxed = m[5] ?? m[6] ?? m[7];
      const raw = cylinder ?? pill ?? boxed;
      const shape: NodeShape = cylinder != null ? "cylinder" : pill != null ? "pill" : "card";

      const existing = nodes.get(id);
      if (raw != null || !existing) {
        const text = (raw ?? id).replace(/^"|"$/g, "");
        const [label, ...rest] = text.split(/<br\s*\/?>/i).map((s) => s.trim());
        nodes.set(id, {
          id,
          label,
          subtitle: rest.length ? rest.join(" ") : undefined,
          shape: raw != null ? shape : existing?.shape ?? "card",
          parent: existing?.parent ?? groupStack[groupStack.length - 1],
        });
      }
      ids.push(id);
    }
    return ids;
  }

  function parseStatement(line: string): boolean {
    // Split into endpoint / link / endpoint / link / ... chains.
    // Link forms: -->, ---, -.->, -.-, ==>, ===, with optional |label| or inline `-- text -->`.
    const linkRe =
      /\s*(?:--\s+([^-]+?)\s+-->|-\.\s+([^.]+?)\s+\.->|==\s+([^=]+?)\s+==>|(-\.->|-\.-|-->|---|==>|===))(?:\s*\|([^|]*)\|)?\s*/g;

    const endpoints: string[][] = [];
    const links: { label?: string; dotted: boolean; arrow: boolean }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = linkRe.exec(line))) {
      const chunk = line.slice(last, m.index).trim();
      const ids = registerEndpoints(chunk);
      if (!ids || ids.length === 0) return false;
      endpoints.push(ids);

      const inlineLabel = m[1] ?? m[2] ?? m[3];
      const op = m[4] ?? (m[1] != null ? "-->" : m[2] != null ? "-.->" : "==>");
      links.push({
        label: (m[5] ?? inlineLabel)?.trim().replace(/^"|"$/g, "") || undefined,
        dotted: op.startsWith("-."),
        arrow: op.endsWith(">"),
      });
      last = linkRe.lastIndex;
    }

    const tailChunk = line.slice(last).trim();
    if (links.length === 0) {
      // bare node definition line
      const ids = registerEndpoints(tailChunk);
      return ids != null && ids.length > 0;
    }
    const tail = registerEndpoints(tailChunk);
    if (!tail || tail.length === 0) return false;
    endpoints.push(tail);

    for (let k = 0; k < links.length; k++) {
      for (const s of endpoints[k]) {
        for (const t of endpoints[k + 1]) {
          edges.push({ id: `e${edgeSeq++}`, source: s, target: t, ...links[k] });
        }
      }
    }
    return true;
  }
}
