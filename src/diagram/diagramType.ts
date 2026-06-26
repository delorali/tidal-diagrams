/**
 * Detects Mermaid diagram-type headers that Tidal does NOT render (it only
 * supports flowcharts/graphs). Pasting e.g. a `sequenceDiagram` into the text
 * panel or the import dialog used to be force-fed through the flowchart parser,
 * which shattered every line into a floating node. This guard catches those
 * inputs up front so we can show a clear message instead of garbage.
 */

export interface UnsupportedDiagram {
  /** The Mermaid keyword we matched, e.g. "sequenceDiagram". */
  keyword: string;
  /** Human-friendly name for messaging, e.g. "Sequence diagrams". */
  label: string;
}

/**
 * Maps the leading keyword of a Mermaid diagram to a friendly label.
 * Flowchart/`graph` are intentionally absent — those are what we DO support.
 */
const UNSUPPORTED: Record<string, string> = {
  sequenceDiagram: "Sequence diagrams",
  stateDiagram: "State diagrams",
  "stateDiagram-v2": "State diagrams",
  classDiagram: "Class diagrams",
  erDiagram: "Entity-relationship diagrams",
  journey: "User-journey diagrams",
  gantt: "Gantt charts",
  pie: "Pie charts",
  quadrantChart: "Quadrant charts",
  requirementDiagram: "Requirement diagrams",
  gitGraph: "Git graphs",
  mindmap: "Mindmaps",
  timeline: "Timelines",
  sankey: "Sankey diagrams",
  "sankey-beta": "Sankey diagrams",
  xychart: "XY charts",
  "xychart-beta": "XY charts",
  block: "Block diagrams",
  "block-beta": "Block diagrams",
  C4Context: "C4 diagrams",
  C4Container: "C4 diagrams",
  C4Component: "C4 diagrams",
  C4Dynamic: "C4 diagrams",
};

/**
 * Returns the unsupported diagram type if `source` opens with a Mermaid header
 * for a type we can't render, else null. Only the first meaningful line is
 * inspected, so a flowchart node that happens to contain one of these words
 * won't trip the guard.
 */
export function detectUnsupportedDiagramType(source: string): UnsupportedDiagram | null {
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || line.startsWith("//")) continue;
    // First token: a Mermaid keyword like `sequenceDiagram` or `stateDiagram-v2`.
    const token = line.match(/^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/)?.[1];
    if (token && token in UNSUPPORTED) {
      return { keyword: token, label: UNSUPPORTED[token] };
    }
    // Only the first non-comment line can be a diagram-type header.
    return null;
  }
  return null;
}

/** A one-line, user-facing message for an unsupported diagram type. */
export function unsupportedMessage(d: UnsupportedDiagram): string {
  return `${d.label} aren't supported yet — Tidal renders flowcharts. Try graph syntax, e.g. "A -> B".`;
}
