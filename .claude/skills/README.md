# Tidal Diagrams — Claude Code skills

Project-scoped Claude Code skills that turn natural-language prompts into diagrams in
this app, and push diagrams out to Figma as editable layers. They live **in this repo**
(under `.claude/skills/`) on purpose — they're tightly coupled to the app's quick-text
DSL, the loader in `src/diagram/urlLoad.ts`, the spec builder in `src/diagram/figmaExport.ts`,
the helper in `scripts/diagram-link.mjs`, and the Liquid design tokens. They version with
the code that they depend on; a change to the DSL or tokens updates the skill in the same PR.

## `/diagram <description>` — prompt → diagram in the app

Authors quick-text from your description, encodes it into a deep-link, and prints a
clickable `http://localhost:5173/#t=…` URL. Open it (or paste it into the tab already
running the app) and the diagram loads — decoded by `src/diagram/urlLoad.ts`, laid out
fresh like a Mermaid import.

```
/diagram a checkout flow with payment retries
/diagram microservices: gateway → auth, orders, payments, each with its own database
/diagram a request flow, left to right, fit 4:3
```

Under the hood it pipes quick-text through `scripts/diagram-link.mjs`:

```bash
printf '%s' "$QUICKTEXT" | node scripts/diagram-link.mjs \
  --title "Checkout flow" --direction LR --aspect 4:3 --port 5173
```

- `--direction LR|TB|RL|BT` — flow direction (or a `direction LR` line in the quick-text).
- `--aspect 4:3|16:9|1.5` — best-effort bias of the layout toward an aspect ratio.
- `--port` — dev-server port (default 5173).

The diagram also loads from `#j=<base64 DiagramDoc>` for a full exported document.

## In-app exports (no Claude Code needed)

The app's **Export** menu also gained:
- **PNG file (4:3)** / **PNG file (16:9)** — pads the rendered frame to that ratio,
  content centered, for slide-ready images.
- **Export to Figma…** — copies a Figma-ready spec + the `/diagram-to-figma` command
  to your clipboard. Paste it into Claude Code (see below).

## `/diagram-to-figma <figma-design-url>` — diagram → editable Figma layers

Rebuilds a diagram as native, editable Figma layers in a **design** file
(`figma.com/design/…`, not FigJam/Slides), via the Figma MCP. Two ways to feed it:

1. Click **Export → Export to Figma…** in the app (copies the spec + command), then paste
   into Claude Code and fill in your Figma design-page URL.
2. Or let the skill read the live diagram from the running app.

```
/diagram-to-figma https://figma.com/design/<key>/<name>?node-id=<page>
```

It produces a faithful, on-brand rebuild — Geist Mono card labels, bezier connectors
attaching at side-centers, the database cylinder silhouette imported as an editable vector,
glass-pill edge labels, hairline borders, soft shadows. Every box, label, curve, and the
cylinder are real, editable layers (not a flat image).

> A web app can't write to Figma directly — only the Figma Plugin API (via the MCP /
> Claude Code) can create nodes. That's why the in-app button hands off to this skill
> rather than pushing to Figma itself.

## Files

| Path | Role |
|---|---|
| `.claude/skills/diagram/SKILL.md` | `/diagram` — prompt → deep-link |
| `.claude/skills/diagram-to-figma/SKILL.md` | `/diagram-to-figma` — diagram → Figma layers |
| `scripts/diagram-link.mjs` | quick-text → deep-link encoder |
| `src/diagram/urlLoad.ts` | app-side hash-payload loader |
| `src/diagram/figmaExport.ts` | `docToFigmaSpec` + clipboard payload |
| `src/diagram/tidy.ts` | `layoutForAspect` / `parseAspect` (aspect bias) |
| `src/diagram/export.ts` | PNG export at a target aspect ratio |
