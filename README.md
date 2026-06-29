# Tidal Diagrams

A canvas diagram builder in the [Tidal Design System](https://tidal-design-system-docs.vercel.app/)
visual style. Build diagrams directly on the canvas — add nodes from the toolbar, pull connected
nodes out of a hovered node's "+" buttons, drag handles to connect, edit everything in the
Figma-style inspector or by double-clicking text in place. Export as PNG, SVG, or JSON.

## Run

```sh
npm install
npm run dev
```

## Use these skills

Two [Claude Code](https://claude.com/claude-code) skills build and export diagrams here. The app
is deployed at **https://tidal-diagrams.vercel.app**, so you can use them **without
cloning** — install the plugin and they target the hosted app automatically:

```text
/plugin marketplace add https://github.com/Liquid4All/tidal-diagrams.git
/plugin install tidal-diagram-skills@tidal-diagrams
```

> The HTTPS URL is recommended — the `owner/repo` shorthand clones over SSH, which
> fails if you haven't set up an SSH key + GitHub host key locally.

- **`/tidal-diagram-skills:diagram <description>`** — turns a prompt into a diagram and prints a
  link that loads it in the app (e.g. `/tidal-diagram-skills:diagram a checkout flow with retries`).
  Add hints like "left to right" or "fit 4:3".
- **`/tidal-diagram-skills:diagram-to-figma <figma /design/ URL>`** — rebuilds the current diagram
  as editable Figma layers (needs Claude's Figma integration connected).

### Example prompts

Starting points — describe the *system*, not the syntax. The skill picks shapes, layout, and
labels for you; add hints like "left to right", "fit 16:9", or "group the backend" to steer it.

```text
/tidal-diagram-skills:diagram a user signup flow: form → validation → create account → welcome email, left to right
/tidal-diagram-skills:diagram a checkout flow with a retry loop on failed payment
/tidal-diagram-skills:diagram a RAG pipeline: query → embed → vector search → LLM → response, with the docs store as a cylinder
/tidal-diagram-skills:diagram a 3-tier web architecture (client, API, database), group the backend services
/tidal-diagram-skills:diagram the model lifecycle: pre-train → fine-tune → evaluate → deploy → monitor, fit 16:9
/tidal-diagram-skills:diagram a CI/CD pipeline from commit to production with a manual approval gate
/tidal-diagram-skills:diagram an event-driven order system: API publishes to a queue, three consumers fan out
```

Have a Mermaid flowchart already? Paste it in and ask to import it, or open the app and use
**Import → Mermaid…**. To refine, just keep talking — "make it top-down", "split the email step
into two", "add an error path".

Working in this repo, the same skills auto-load as project skills — just `/diagram` and
`/diagram-to-figma`, no install. Full details in [`.claude/skills/README.md`](.claude/skills/README.md).

## Editing model

- **Document = source of truth.** The diagram is a JSON doc (nodes/edges/meta) in a zustand store,
  autosaved to localStorage. Mermaid is an importer (Import → Mermaid…), not a live format.
- **Home page + local library:** the app lands on a home screen — "New diagram" or "Import ▾"
  (Mermaid / image / JSON) — with a Recents grid of every diagram, each card showing a schematic
  thumbnail rendered from the doc's own geometry. Diagrams autosave into a localStorage library
  (open / duplicate / delete from the grid); click the wordmark in the editor to go home.
  Per-browser storage; use Export → JSON for backups. No accounts or backend.
- **Import from image** (Import → Image…): Claude transcribes a screenshot of any diagram
  (Mermaid render, Excalidraw, whiteboard photo) into the Mermaid subset, shows it for review, then
  imports it as editable nodes. Needs an Anthropic API key — stored in localStorage, sent only to
  the Anthropic API directly from the browser.
- **Node anatomy is composable** on one card type: optional header (title + muted suffix), optional
  mono body label, and label/value rows — toggled per node in the inspector. Pills (glass labels),
  database cylinders, and group containers round out the set.
- **Flora-style creation:** bottom toolbar adds nodes at the canvas center; hovering a node shows
  "+" buttons on each side that spawn a connected node from a type menu; dropping a connection on
  empty canvas offers the same menu at the drop point; dropping on a node body connects to it.
- **History:** undo/redo with semantic granularity — a drag is one step, a typing burst is one
  step. ⌘Z / ⇧⌘Z / ⌘D / Delete.
- **Tidy** re-runs dagre auto-layout on demand using measured node sizes; manual positions are
  never overwritten implicitly.
- Edges attach to node sides dynamically (floating edges), so they stay sensible as you drag.

Known gap: dragging nodes into/out of groups does not reparent them yet (groups move their
children, and can be resized when selected).

## Mermaid import (flowchart subset)

```text
flowchart LR                      %% direction: LR, RL, TB/TD, BT

  a[Card label]                   %% rounded card, Geist Mono label
  b[Title<br/>Subtitle]           %% two-line card: sans title + mono subtitle
  c[(Database)]                   %% cylinder
  d([Pill])                       %% glass pill node

  a --> b                         %% solid arrow
  a -->|label| b                  %% arrow with glass-pill label
  a -- label --> b                %% same, inline label form
  a -.-> b                        %% dotted arrow
  a --- b                         %% line, no arrowhead
  a --> b & c                     %% fan-out

  subgraph backend [Group title]  %% container with header row
    b
    c
  end
```

`classDef`, `class`, `style`, `linkStyle`, and `click` statements are accepted and ignored, so
existing Mermaid files paste in cleanly.

## How it works

- `src/diagram/doc.ts` — document model (composable card data, edge data, strip/sort helpers)
- `src/diagram/store.ts` — zustand store: the doc, all edit actions, manual undo/redo history with
  per-action coalescing, localStorage persistence
- `src/diagram/parse.ts` + `io.ts` — Mermaid-subset parser and spec→doc / JSON import-export
- `src/diagram/tidy.ts` — dagre auto-layout from measured (or estimated) node sizes
- `src/diagram/nodes.tsx` / `TidalEdge.tsx` — custom React Flow nodes/edges styled from the Figma
  diagram spec, with inline text editing; edges compute attachment sides from live node bounds
- `src/diagram/Inspector.tsx` — Figma-style right panel (Tidal `SidePanel`) bound to selection
- `src/diagram/Toolbar.tsx` / `NodePlusToolbar.tsx` — add-node bar and hover "+" spawn flow
- `src/diagram/export.ts` — PNG/SVG export via html-to-image with font embedding
- Theming via `@liquidai/tokens` CSS variables; light/dark with the `.dark` class. App chrome is
  built from `@liquidai/react` components.

## Notes

- Charts (bar/line/etc.) are intentionally out of scope for now; the Tidal `Chart` components are
  the likely path for those.
