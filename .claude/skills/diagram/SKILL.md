---
name: diagram
description: Build a Tidal Diagrams diagram from a natural-language prompt and hand it to the running app as a clickable deep-link. Use when the user types /diagram <description> or asks to create/build/draw a diagram in the tidal-diagrams app.
---

# /diagram — prompt → diagram in the Tidal Diagrams app

Turn the user's description into a **quick-text** diagram, encode it into a deep-link,
and print the link. When the user opens it, the running app loads the diagram
(decoded by `src/diagram/urlLoad.ts`, laid out fresh via the same path as Mermaid import).

## Steps

1. **Author quick-text** from the user's prompt using the syntax below. Aim for a
   clear, well-grouped diagram — pick a sensible `direction`, give nodes real labels,
   use shapes (`#db`, `#pill`) and groups where they add meaning.
2. **Build the link** by piping the quick-text into the encoder script. Give it a short title:
   ```bash
   # The encoder is bundled with this skill. Pick the path that exists:
   #   • installed as a plugin → "$CLAUDE_PLUGIN_ROOT/scripts/diagram-link.mjs"
   #   • working inside the tidal-diagrams repo → scripts/diagram-link.mjs
   ENC="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/}scripts/diagram-link.mjs"
   printf '%s' "$QUICKTEXT" | node "$ENC" --title "Checkout flow"
   ```
   - The script auto-targets `http://localhost:5173`. If the dev server runs on
     another port, pass `--port <n>` (or set `TIDAL_PORT`). Quickly check with
     `lsof -ti tcp:5173` or look for the Vite process; if the app isn't running,
     tell the user to start it with `npm run dev` first.
   - **Direction**: prefer a `direction LR` line in the quick-text. The
     `--direction LR|TB|RL|BT` flag is a convenience override for the whole diagram.
   - **Aspect / dimensions**: pass `--aspect 4:3` (also `16:9`, `1.5`) to bias the
     layout so the content bounding box approximates that ratio. This is *best-effort*
     — dagre never wraps ranks, so a long linear chain keeps its shape; branching
     diagrams respond well. If the user wants a specific ratio, prefer a `direction`
     that suits it (wide ratios → `LR`, tall → `TB`) and add branching where natural.
3. **Show the result**: print the quick-text in a code block (so the user can read/tweak it)
   followed by the link on its own line, e.g. `Open: <url>`. The link is long — that's expected.

If the app is already open in the browser, opening the link in that same tab swaps in
the new diagram live (the app also listens for `hashchange`).

## Quick-text syntax (cheat-sheet)

```
direction LR            # flow direction: LR | TB | RL | BT (also right/down/left/up)

Node Label              # a card (default shape)
Service / detail line   # two-line card: title  /  mono subtitle
Database #db            # cylinder shape
Gateway #pill           # pill shape
Cache #outline          # surface: #solid | #outline | #ghost
Queue @q                # explicit id with @id (so edges can reference it)

Group Name:             # group header; indent the lines under it to nest
  Worker A
  Worker B

A -> B                  # arrow            A --> B is the same
A ..> B                 # dotted arrow
A <-> B                 # bidirectional    A <..> B  bidirectional dotted
A -- B                  # plain line, no arrow
A -> |label| B          # labelled edge    (also A ..> |retries| B)
A, B -> C, D            # fan-out: every left node connects to every right node
// a comment line
```

Notes:
- Reference a node in an edge by its label text (its id is the slugged title) or by an explicit `@id`.
- Quote a label to keep punctuation literal: `"Auth (OAuth2)"`.
- Keep it to flowchart-style nodes/edges/groups. Sequence diagrams use a different
  syntax and are imported separately, not via this command.

## Example

Prompt: *"a checkout flow with payment retries"*

Quick-text:
```
direction LR
Cart #pill
Checkout
Payment / Stripe #db
Order Service
Cart -> Checkout
Checkout -> |charge| Payment
Payment ..> |retry| Checkout
Checkout -> |on success| Order Service
```

Then run the encoder with `--title "Checkout flow"` and share the printed URL.

> Label placement matters: the label goes **right after the operator** —
> `A -> |label| B`, not `A -> B |label|`. The latter folds the label into B's name.
