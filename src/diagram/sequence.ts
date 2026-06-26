/**
 * Parser for the Mermaid `sequenceDiagram` subset. Produces an ordered
 * SequenceSpec (participants + a flat event stream) that the sequence layout
 * turns into lifelines, activation bars, messages, notes, and fragment frames.
 *
 * Supported:
 *   participant X            actor X            participant X as "Label"
 *   A->>B: text              (all arrow forms below)
 *   A->>+B: text             activate target with the message
 *   B-->>-A: text            deactivate source with the message
 *   activate X / deactivate X
 *   Note over X: text        Note over X,Y: text
 *   Note left of X: text     Note right of X: text
 *   alt / else / opt / loop / par / and / critical / option / break / end
 *   <br/> inside any text becomes a line break
 *
 * Intentionally ignored (skipped without error): autonumber, box…end,
 * rect…end, links/notes-as-links, and styling directives.
 */

export type SeqArrowHead = "none" | "arrow" | "cross" | "open";

export interface SeqArrow {
  dotted: boolean;
  head: SeqArrowHead;
}

export interface SeqParticipant {
  id: string;
  label: string;
  /** `actor` keyword (vs `participant`). Kept for future actor glyphs. */
  actor: boolean;
}

export interface SeqMessage {
  kind: "message";
  from: string;
  to: string;
  text: string;
  arrow: SeqArrow;
  /** `+` after the arrow: activate the target. */
  activateTarget: boolean;
  /** `-` after the arrow: deactivate the source. */
  deactivateSource: boolean;
}

export interface SeqNote {
  kind: "note";
  placement: "over" | "leftOf" | "rightOf";
  /** One participant for left/right; one or two for `over`. */
  participants: string[];
  text: string;
}

export interface SeqActivation {
  kind: "activate" | "deactivate";
  participant: string;
}

export type FragmentType = "alt" | "opt" | "loop" | "par" | "critical" | "break";

export interface SeqFragmentStart {
  kind: "fragmentStart";
  type: FragmentType;
  label: string;
}

/** A divider inside a fragment: `else`, `and`, or `option`. */
export interface SeqFragmentElse {
  kind: "fragmentElse";
  label: string;
}

export interface SeqFragmentEnd {
  kind: "fragmentEnd";
}

export type SeqEvent =
  | SeqMessage
  | SeqNote
  | SeqActivation
  | SeqFragmentStart
  | SeqFragmentElse
  | SeqFragmentEnd;

export interface SequenceSpec {
  participants: SeqParticipant[];
  events: SeqEvent[];
}

export interface SequenceParseResult {
  spec: SequenceSpec;
  /** 1-based line warnings for input we couldn't make sense of. */
  warnings: { line: number; message: string }[];
}

// Longest-first so `-->>` matches before `->>`, `--x` before `-x`, etc.
const ARROW_SRC = ["-->>", "->>", "-->", "->", "--x", "-x", "--)", "-)"];
const ARROW_ALT = ARROW_SRC.map((a) => a.replace(/[-)>x]/g, (c) => "\\" + c)).join("|");
const MSG_RE = new RegExp(
  `^([A-Za-z0-9_]+)\\s*(${ARROW_ALT})\\s*([+-])?\\s*([A-Za-z0-9_]+)\\s*:\\s*(.*)$`,
);

function arrowOf(op: string): SeqArrow {
  const dotted = op.startsWith("--");
  const head: SeqArrowHead = op.endsWith(">>")
    ? "arrow"
    : op.endsWith(">")
      ? "none"
      : op.endsWith("x")
        ? "cross"
        : "open"; // ends with ")"
  return { dotted, head };
}

const FRAGMENT_OPENERS: Record<string, FragmentType> = {
  alt: "alt",
  opt: "opt",
  loop: "loop",
  par: "par",
  critical: "critical",
  break: "break",
};

/** `<br/>`, `<br>`, `<br />` → newline; trim each resulting line. */
function normalizeText(s: string): string {
  return s
    .split(/<br\s*\/?>/i)
    .map((p) => p.trim())
    .join("\n")
    .trim();
}

export function parseSequence(source: string): SequenceParseResult {
  const order: string[] = [];
  const byId = new Map<string, SeqParticipant>();
  const events: SeqEvent[] = [];
  const warnings: { line: number; message: string }[] = [];
  let fragmentDepth = 0;

  /** Ensure a participant exists, preserving first-seen order. */
  function ensure(id: string, label?: string, actor = false): string {
    const existing = byId.get(id);
    if (existing) {
      if (label) existing.label = label;
      return id;
    }
    order.push(id);
    byId.set(id, { id, label: label ?? id, actor });
    return id;
  }

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNo = i + 1;
    if (!line || line.startsWith("%%") || line.startsWith("//")) continue;
    if (/^sequenceDiagram\b/.test(line)) continue;
    if (/^(autonumber|box|rect|end\s+box)\b/i.test(line)) continue; // ignored directives

    // participant / actor (optional `as` alias)
    const pm = line.match(/^(participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/i);
    if (pm) {
      const label = pm[3] ? normalizeText(pm[3].replace(/^"|"$/g, "")) : undefined;
      ensure(pm[2], label, pm[1].toLowerCase() === "actor");
      continue;
    }

    // notes
    const nm = line.match(/^note\s+(over|left of|right of)\s+([A-Za-z0-9_,\s]+?)\s*:\s*(.*)$/i);
    if (nm) {
      const placement = nm[1].toLowerCase() === "over" ? "over" : nm[1].toLowerCase() === "left of" ? "leftOf" : "rightOf";
      const parts = nm[2].split(",").map((p) => p.trim()).filter(Boolean).map((p) => ensure(p));
      events.push({ kind: "note", placement, participants: parts, text: normalizeText(nm[3]) });
      continue;
    }

    // activate / deactivate
    const am = line.match(/^(activate|deactivate)\s+([A-Za-z0-9_]+)$/i);
    if (am) {
      events.push({ kind: am[1].toLowerCase() as "activate" | "deactivate", participant: ensure(am[2]) });
      continue;
    }

    // fragment control
    const fm = line.match(/^([A-Za-z]+)\b\s*(.*)$/);
    const keyword = fm?.[1].toLowerCase();
    if (keyword === "end") {
      if (fragmentDepth === 0) warnings.push({ line: lineNo, message: '"end" without an open fragment' });
      else {
        fragmentDepth--;
        events.push({ kind: "fragmentEnd" });
      }
      continue;
    }
    if (keyword && keyword in FRAGMENT_OPENERS && !MSG_RE.test(line)) {
      fragmentDepth++;
      events.push({ kind: "fragmentStart", type: FRAGMENT_OPENERS[keyword], label: normalizeText(fm![2]) });
      continue;
    }
    if ((keyword === "else" || keyword === "and" || keyword === "option") && !MSG_RE.test(line)) {
      events.push({ kind: "fragmentElse", label: normalizeText(fm![2]) });
      continue;
    }

    // message
    const mm = line.match(MSG_RE);
    if (mm) {
      const [, from, op, plusMinus, to, text] = mm;
      events.push({
        kind: "message",
        from: ensure(from),
        to: ensure(to),
        text: normalizeText(text),
        arrow: arrowOf(op),
        activateTarget: plusMinus === "+",
        deactivateSource: plusMinus === "-",
      });
      continue;
    }

    warnings.push({ line: lineNo, message: `Could not parse "${line}"` });
  }

  if (fragmentDepth > 0) warnings.push({ line: lines.length, message: `${fragmentDepth} fragment(s) missing "end"` });

  return {
    spec: { participants: order.map((id) => byId.get(id)!), events },
    warnings,
  };
}
