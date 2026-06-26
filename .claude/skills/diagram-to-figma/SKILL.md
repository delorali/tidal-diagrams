---
name: diagram-to-figma
description: Rebuild a Tidal Diagram as editable layers in a Figma design file. Use when the user runs /diagram-to-figma with a figma.com/design/... page URL and a diagram spec (pasted JSON from the app's "Export to Figma" button, or read live from the running app).
---

# /diagram-to-figma — Tidal diagram → editable Figma layers

Rebuild a diagram as native, editable Figma layers (frames, text, arrowed vectors) in a
target **design** file, using the Figma Plugin API via `use_figma`.

## Inputs

- **A Figma page URL** — must be a **design** file: `figma.com/design/<key>/...`.
  Reject `figma.com/board/...` (FigJam) and `/slides/...` — connectors and several node
  types differ there. If given a non-design URL, stop and tell the user.
- **A diagram spec** (`FigmaSpec` JSON) — one of:
  1. Pasted by the user (the in-app **Export → Export to Figma** button copies exactly this).
  2. Read live from the running app: open the app tab and read
     `localStorage["tidal-diagrams-doc"]`, then build the same spec shape from the doc
     (kinds card/pill/cylinder/group, absolute coords, resolved hex). Prefer the pasted
     spec when present — it already has resolved geometry and colors.

`FigmaSpec` shape (see `src/diagram/figmaExport.ts`):
```
{ title, direction,
  nodes: [{ id, kind: "card|pill|cylinder|group", x, y, w, h, label,
            header?, subtitle?, rows?, parent?, fillHex?, strokeHex?, textHex }],
  edges: [{ source, target, label?, dotted, arrow, arrowStart?, strokeHex }] }
```
Coordinates are absolute canvas px (y-down). Colors are light-theme hex.

## Preflight

1. **Load the API skill and tools.** This skill pairs with `figma-use` — follow its rules
   (return IDs, colors 0–1, load fonts before text, atomic scripts, ≤10 ops/call). Batch-load
   the Figma tools in one `ToolSearch`: `select:use_figma,get_metadata,get_screenshot`.
2. **Resolve the target page.** From the URL, switch to the page node
   (`await figma.setCurrentPageAsync(page)`), or the page in the URL's `node-id`. Confirm the
   file is design mode.
3. **Pick a clear origin.** Scan `figma.currentPage.children` for the rightmost edge and place
   the diagram's wrapper there (e.g. `originX = maxRight + 120, originY = 80`) so it never
   lands on existing work (figma-use Rule 13).

## Style tokens (match the app — light theme)

These are the resolved Liquid values the app renders with. The spec bakes most into
`fillHex`/`strokeHex`/`textHex`; the radii, fonts, shadow, and edge shapes below are the rest.

- **Fonts**: card body labels + row values → **Geist Mono** (check `listAvailableFontsAsync`; fall
  back to Roboto Mono → JetBrains Mono → Inter). Headers, pills, cylinder labels, group headers →
  **Inter** (Semi Bold for card headers, Medium for cylinder labels, Regular elsewhere). The spec's
  `mono:true` flag marks text that should be Geist Mono.
- **Card**: `cornerRadius 10`, fill `#fafafa`, 1px `#e8e8e8` stroke, drop shadow
  `{type:'DROP_SHADOW', color:{r:0,g:0,b:0,a:0.05}, offset:{x:0,y:2}, radius:10}`.
- **Pill**: `cornerRadius 8`, fill `#ffffff`, 1px `#b3b3b3` stroke, text `#737373` Inter 13.
- **Group**: `cornerRadius 12`, fill `#ffffff`, 1px `#e8e8e8` stroke, header Inter 13 at top-left.
- **Connector**: `#c7c7c7`, 1px, dotted → `dashPattern [2.5,4]`. Arrowheads via `ARROW_LINES`
  stroke caps (open V — matches the app's marker).
- **Edge label**: a glass-pill chip — `cornerRadius 8`, opaque `#ffffff` fill (masks the line),
  1px `#b3b3b3` stroke, text `#737373` Inter 13, padding ~10×6, centered on the curve midpoint.

## Build (incremental — validate with a screenshot between milestones)

Convert hex → `{r,g,b}` 0–1. Offset every node by the spec's min x/y so the diagram starts at
`pad` inside a wrapper, then place the wrapper at the clear origin.

1. **Wrapper.** One `figma.createFrame()` named after `title`, sized to the content bbox + `pad`,
   `clipsContent = false`. Everything else is appended with relative coords (`x - minX + pad`).
2. **Groups first, sent to back** (insert at index 0): a frame with the group tokens + header TEXT.
3. **Nodes** — one `figma.createAutoLayout()` per node, centered (`primaryAxisAlignItems` +
   `counterAxisAlignItems = 'CENTER'`), append, then `layoutSizingHorizontal/Vertical='FIXED'`,
   `resize(w,h)`, set position, radius/fill/stroke/effects per the tokens above.
   - **card** → single centered Geist Mono TEXT, or (with `header`) a `VERTICAL` layout, left
     aligned (`counterAxisAlignItems='MIN'`): header Inter Semi Bold + body Geist Mono.
   - **pill** → single centered Inter TEXT, muted.
   - **cylinder** → DON'T fake it with a rectangle. Import the app's silhouette as an editable
     vector via `figma.createNodeFromSvg` (this is the "text stays text, shape is vector" mix),
     then overlay a centered Inter Medium label at ~40% height. With `ry = min(33, h/4)`:
     ```svg
     <svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">
       <path d="M1 {ry} v{h-2ry} a{w/2-1} {ry} 0 0 0 {w-2} 0 v-{h-2ry}" fill="#fafafa" stroke="#e8e8e8" stroke-width="1"/>
       <ellipse cx="{w/2}" cy="{ry}" rx="{w/2-1}" ry="{ry-1}" fill="#fafafa" stroke="#e8e8e8" stroke-width="1"/>
       <path d="M1 {h*0.42} a{w/2-1} {ry} 0 0 0 {w-2} 0" fill="none" stroke="#e8e8e8" stroke-width="1"/>
       <path d="M1 {h*0.62} a{w/2-1} {ry} 0 0 0 {w-2} 0" fill="none" stroke="#e8e8e8" stroke-width="1"/>
     </svg>
     ```
   - Load every font before setting `characters`.
4. **Edges — bezier, side-center attach** (matches the app's `getBezierPath`, curvature 0.35).
   Pick the attachment side by dominant axis between centers (right/left when |dx|≥|dy|, else
   top/bottom); the endpoint sits at that side's **midpoint**. Build a cubic via segment tangents:
   ```js
   // horizontal attach: ts = {x:(tx-sx)/2, y:0},  te = {x:-(tx-sx)/2, y:0}
   // vertical   attach: ts = {x:0, y:(ty-sy)/2},  te = {x:0, y:-(ty-sy)/2}
   const v = figma.createVector();
   await v.setVectorNetworkAsync({
     vertices: [
       { x: sx, y: sy, strokeCap: edge.arrowStart ? 'ARROW_LINES' : 'NONE' },
       { x: tx, y: ty, strokeCap: edge.arrow ? 'ARROW_LINES' : 'NONE' },
     ],
     segments: [{ start: 0, end: 1, tangentStart: ts, tangentEnd: te }],
   });
   v.strokes = [{type:'SOLID', color: rgb(edge.strokeHex)}]; v.strokeWeight = 1;
   if (edge.dotted) v.dashPattern = [2.5, 4];
   wrapper.insertChild(0, v); // behind the nodes so arrowheads tuck under
   ```
   (Design mode has **no Connector** node — bezier vectors with `ARROW_LINES` caps are the editable
   equivalent.) Add a glass-pill label chip (above the nodes) at the curve midpoint `((sx+tx)/2,(sy+ty)/2)`.
5. **Validate.** `get_screenshot` of the wrapper; check for overlaps, clipped text, missing arrows.
   Fix targeted issues; don't rebuild wholesale. Return all created node IDs.

## Notes

- Keep it to ≤10 logical ops per `use_figma` call — wrapper+groups, nodes in batches, the cylinder,
  then edges+labels, validating as you go.
- Every box, label, curve, and the cylinder silhouette is a **real, editable** layer — not a flat
  image. Colors come baked into the spec; fonts/radii/shadow/curves come from the tokens above.
- The diagram direction is informational; geometry is already baked into coordinates.
