import type { DiagramDoc } from "./doc";
import { jsonToDoc, specToDoc } from "./io";
import { parseQuickText } from "./quicktext";
import { parseAspect } from "./tidy";
import type { Direction } from "./types";

/**
 * Load a diagram from the URL fragment so an external tool (e.g. a `/diagram`
 * prompt in Claude Code) can hand a freshly-built diagram to a running app via
 * a single clickable link. No backend, no paste.
 *
 * Supported fragments (URL-safe base64, no padding):
 *   #t=<base64 quick-text>   — the quick-text DSL, laid out fresh on load
 *   #j=<base64 DiagramDoc>   — a full exported JSON document
 * Optional, on either form:
 *   &title=<url-encoded>     — document title
 *   &dir=LR|TB|RL|BT         — flow direction override (quick-text only)
 *   &fit=4:3                 — bias layout toward an aspect ratio (quick-text only)
 */

const DIRECTIONS: Record<string, Direction> = { LR: "LR", TB: "TB", RL: "RL", BT: "BT" };

const PARAM_RE = /(^|&)([tj])=([^&]+)/;

/** Decode URL-safe base64 (no padding) back into a UTF-8 string. */
function decodeBase64Url(value: string): string {
  const std = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface HashLoad {
  doc: DiagramDoc;
  /** Quick-text parse diagnostics worth surfacing (errors/warnings). */
  warnings: string[];
}

/**
 * Parse a location hash into a document. Returns null when there is no diagram
 * payload; throws (with a human-readable message) when a payload is malformed.
 */
export function docFromHash(hash: string): HashLoad | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = raw.match(PARAM_RE);
  if (!match) return null;

  const kind = match[2];
  const payload = decodeBase64Url(match[3]);
  const titleMatch = raw.match(/(^|&)title=([^&]*)/);
  const title = titleMatch ? decodeURIComponent(titleMatch[2]) : undefined;

  if (kind === "j") {
    const doc = jsonToDoc(payload);
    return { doc: title ? { ...doc, meta: { ...doc.meta, title } } : doc, warnings: [] };
  }

  // kind === "t": quick-text DSL
  const { spec, diagnostics, unsupported } = parseQuickText(payload);
  if (unsupported) throw new Error(diagnostics[0]?.message ?? "Unsupported diagram type");
  if (spec.nodes.length === 0) throw new Error("The diagram text has no nodes");

  const dirParam = raw.match(/(^|&)dir=([^&]+)/)?.[2]?.toUpperCase();
  if (dirParam && DIRECTIONS[dirParam]) spec.direction = DIRECTIONS[dirParam];
  const fitParam = raw.match(/(^|&)fit=([^&]+)/)?.[2];
  const aspect = fitParam ? parseAspect(decodeURIComponent(fitParam)) ?? undefined : undefined;

  return {
    doc: specToDoc(spec, title ?? "Untitled diagram", { aspect }),
    warnings: diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => `Line ${d.line + 1}: ${d.message}`),
  };
}
