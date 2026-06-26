/**
 * Lays out a parsed SequenceSpec as ordinary (editable) Tidal canvas objects:
 *
 *   participant  -> tidalPill header, centered on a lane
 *   lifeline     -> dotted tidal edge from the header down to a bottom anchor
 *   message      -> tidal edge between invisible anchors at (lane, time-Y)
 *   note         -> tidalCard centered over its participant(s)
 *   alt/opt/loop -> tidalGroup frame spanning the involved lanes + time range
 *   activate     -> tidalActivation bar spanning activate→deactivate on a lane
 *
 * Anchors (`tidalAnchor`) are ~0-size attachment points; the floating TidalEdge
 * derives its endpoints from node bounds, so messages stay horizontal and the
 * lifeline stays vertical no matter how the user drags things afterward.
 */

import { DOC_VERSION, newId, sortByParent, type CardData, type DiagramDoc, type TidalEdgeT, type TidalNode } from "./doc";
import { normalizeEdges } from "./io";
import type { SeqArrow, SequenceSpec } from "./sequence";

const LANE_GAP = 320; // horizontal spacing between lifelines
const MARGIN_X = 120; // left padding to first lane center
const HEADER_Y = 0;
const HEADER_H = 52; // reserved height for the participant header
const FIRST_ROW_Y = 128; // y of the first event row, below headers
const ROW_GAP = 60; // vertical spacing per event row (labels sit above thin lines)
const NOTE_ADVANCE = 96; // a note box is taller, so it needs more clearance
const SELF_DY = 30; // vertical span of a self-message loop
const SELF_CURVE = -32; // small rightward arc for a self-message loop
const FRAG_TOP_INSET = 14; // how far the frame extends above its first child
const FRAG_TAB_H = 46; // height of the group's label-tab band
const FRAG_BRANCH_GAP = 84; // room for tab + branch chip before the first message
const FRAG_PAD_X = 44; // group inset beyond outermost lane
const FRAG_PAD_Y = 28; // group inset below the last child
const BOTTOM_GAP = 56; // lifeline tail below the last event
const ACT_WIDTH = 10; // activation-bar width
const ACT_NEST = 7; // horizontal shift per nested activation

/** Rough header width from label length, so we can center it on the lane. */
function headerWidth(label: string): number {
  return Math.min(220, Math.max(96, label.length * 8 + 36));
}

/** A message arrowhead shows unless the arrow is an explicit no-head line. */
function arrowVisible(a: SeqArrow): boolean {
  return a.head !== "none";
}

interface OpenFragment {
  startY: number;
  minLane: number;
  maxLane: number;
  type: string;
  /** The opener's condition, e.g. "eval benchmark" → drawn as "[eval benchmark]". */
  startLabel: string;
  startLabelY: number;
  /** else/and/option dividers: a dashed line + bracket label at each y. */
  elses: { y: number; label: string }[];
}

/** Estimated chip width so a "[condition]" label stays on one line. */
function branchWidth(bracketed: string): number {
  return Math.min(300, Math.max(90, bracketed.length * 8 + 32));
}

export function sequenceToDoc(spec: SequenceSpec, title = "Sequence diagram"): DiagramDoc {
  const nodes: TidalNode[] = [];
  const edges: TidalEdgeT[] = [];

  const laneOf = new Map<string, number>();
  spec.participants.forEach((p, i) => laneOf.set(p.id, i));
  const laneX = (i: number) => MARGIN_X + i * LANE_GAP;

  // Stable, collision-free anchor id per (participant, y).
  const anchorId = (pid: string, y: number) => `a-${pid}-${Math.round(y)}`;
  const ensureAnchor = (pid: string, y: number): string => {
    const id = anchorId(pid, y);
    if (!nodes.some((n) => n.id === id)) {
      nodes.push({ id, type: "tidalAnchor", position: { x: laneX(laneOf.get(pid)!), y }, data: {}, draggable: false });
    }
    return id;
  };
  // Anchor at an arbitrary point (used for fragment divider lines).
  const freeAnchor = (x: number, y: number): string => {
    const id = `fa-${Math.round(x)}-${Math.round(y)}`;
    if (!nodes.some((n) => n.id === id)) {
      nodes.push({ id, type: "tidalAnchor", position: { x, y }, data: {}, draggable: false });
    }
    return id;
  };
  // Activation bars: a stack of open start-Ys per participant; closing one emits
  // a thin bar spanning [startY, endY], shifted right by its nesting depth.
  const actStacks = new Map<string, number[]>();
  const startActivation = (pid: string, atY: number) => {
    const stack = actStacks.get(pid) ?? [];
    stack.push(atY);
    actStacks.set(pid, stack);
  };
  const endActivation = (pid: string, atY: number) => {
    const stack = actStacks.get(pid);
    if (!stack || stack.length === 0) return;
    const startY = stack.pop()!;
    const depth = stack.length; // remaining depth = this bar's nesting level
    const x = laneX(laneOf.get(pid)!) - ACT_WIDTH / 2 + depth * ACT_NEST;
    nodes.push({
      id: `act-${newId()}`,
      type: "tidalActivation",
      position: { x, y: startY },
      data: {},
      style: { width: ACT_WIDTH, height: Math.max(14, atY - startY) },
    });
  };

  // A small centered chip for a branch condition, e.g. "[eval benchmark]".
  const pushBranchLabel = (text: string, centerX: number, top: number) => {
    const label = `[${text}]`;
    const w = branchWidth(label);
    nodes.push({
      id: `br-${newId()}`,
      type: "tidalPill",
      position: { x: centerX - w / 2, y: top },
      data: { label },
      style: { width: w },
    });
  };

  // Track the deepest content y so lifelines and fragments are sized correctly.
  let y = FIRST_ROW_Y;
  let maxY = y;
  const fragments: OpenFragment[] = [];
  const touchLane = (i: number) => {
    for (const f of fragments) {
      f.minLane = Math.min(f.minLane, i);
      f.maxLane = Math.max(f.maxLane, i);
    }
  };

  for (const ev of spec.events) {
    switch (ev.kind) {
      case "message": {
        const fromLane = laneOf.get(ev.from)!;
        const toLane = laneOf.get(ev.to)!;
        touchLane(fromLane);
        touchLane(toLane);
        const msgY = y;
        // `-A` deactivates the source at this message; `+B` activates the target.
        if (ev.deactivateSource) endActivation(ev.from, msgY);
        if (ev.activateTarget) startActivation(ev.to, msgY);
        const arrow = arrowVisible(ev.arrow);
        if (ev.from === ev.to) {
          // self-message: drop a second anchor and bow the edge out to the side
          const a1 = ensureAnchor(ev.from, y);
          const a2 = ensureAnchor(ev.from, y + SELF_DY);
          edges.push({
            id: `m-${newId()}`,
            source: a1,
            target: a2,
            type: "tidal",
            data: { label: ev.text || undefined, dotted: ev.arrow.dotted, arrow, curveOffset: SELF_CURVE, seqLabel: true },
          });
          y += ROW_GAP + SELF_DY;
        } else {
          const a1 = ensureAnchor(ev.from, y);
          const a2 = ensureAnchor(ev.to, y);
          edges.push({
            id: `m-${newId()}`,
            source: a1,
            target: a2,
            type: "tidal",
            data: { label: ev.text || undefined, dotted: ev.arrow.dotted, arrow, seqLabel: true },
          });
          y += ROW_GAP;
        }
        maxY = Math.max(maxY, y);
        break;
      }

      case "note": {
        const lanes = ev.participants.map((p) => laneOf.get(p)!);
        lanes.forEach(touchLane);
        const lo = Math.min(...lanes);
        const hi = Math.max(...lanes);
        const centerX = (laneX(lo) + laneX(hi)) / 2;
        const width = ev.placement === "over" && hi > lo ? laneX(hi) - laneX(lo) + 160 : 200;
        nodes.push({
          id: `note-${newId()}`,
          type: "tidalCard",
          position: { x: centerX - width / 2, y },
          data: { label: ev.text, rows: [], fill: "outline" } satisfies CardData,
          style: { width },
        });
        y += NOTE_ADVANCE;
        maxY = Math.max(maxY, y);
        break;
      }

      case "fragmentStart": {
        fragments.push({
          startY: y - FRAG_TOP_INSET,
          startLabel: ev.label,
          // Seat the chip just below the tab band at the frame top.
          startLabelY: y - FRAG_TOP_INSET + FRAG_TAB_H,
          minLane: Infinity,
          maxLane: -Infinity,
          type: ev.type,
          elses: [],
        });
        y += FRAG_BRANCH_GAP;
        maxY = Math.max(maxY, y);
        break;
      }

      case "fragmentElse": {
        // Record the divider; drawn at fragmentEnd once the frame width is known.
        const f = fragments[fragments.length - 1];
        if (f) f.elses.push({ y, label: ev.label });
        y += FRAG_BRANCH_GAP;
        maxY = Math.max(maxY, y);
        break;
      }

      case "fragmentEnd": {
        const f = fragments.pop();
        if (!f || f.minLane === Infinity) break;
        const left = laneX(f.minLane) - FRAG_PAD_X;
        const right = laneX(f.maxLane) + FRAG_PAD_X;
        const centerX = (left + right) / 2;
        const top = f.startY;
        const bottom = y + FRAG_PAD_Y;
        nodes.push({
          id: `frag-${newId()}`,
          type: "tidalGroup",
          position: { x: left, y: top },
          data: { label: f.type },
          style: { width: right - left, height: bottom - top },
          zIndex: -1,
        });
        // First-branch condition chip, just under the "alt" tab.
        if (f.startLabel) pushBranchLabel(f.startLabel, centerX, f.startLabelY);
        // Each else/and divider: dashed line across the frame + condition chip.
        for (const e of f.elses) {
          const la = freeAnchor(left + 2, e.y);
          const ra = freeAnchor(right - 2, e.y);
          edges.push({
            id: `elsediv-${newId()}`,
            source: la,
            target: ra,
            type: "tidal",
            data: { dotted: true, arrow: false },
          });
          if (e.label) pushBranchLabel(e.label, centerX, e.y + 12);
        }
        y += FRAG_PAD_Y;
        maxY = Math.max(maxY, y);
        break;
      }

      case "activate":
        startActivation(ev.participant, y);
        break;

      case "deactivate":
        endActivation(ev.participant, y);
        break;

      default:
        break;
    }
  }

  // Close any activations left open by malformed input so their bars still draw.
  for (const [pid, stack] of actStacks) {
    while (stack.length) endActivation(pid, maxY);
  }

  const bottomY = maxY + BOTTOM_GAP;

  // Headers + lifelines (built last so they don't shift event y's).
  for (const p of spec.participants) {
    const i = laneOf.get(p.id)!;
    const w = headerWidth(p.label);
    nodes.push({
      id: `p-${p.id}`,
      type: "tidalPill",
      position: { x: laneX(i) - w / 2, y: HEADER_Y },
      data: { label: p.label },
      style: { width: w },
    });
    const top = ensureAnchor(p.id, HEADER_H + 8);
    const bottom = ensureAnchor(p.id, bottomY);
    edges.push({
      id: `life-${p.id}`,
      source: top,
      target: bottom,
      type: "tidal",
      data: { dotted: true, arrow: false },
    });
  }

  return {
    meta: { version: DOC_VERSION, title, direction: "TB" },
    nodes: sortByParent(nodes),
    edges: normalizeEdges(edges),
  };
}
