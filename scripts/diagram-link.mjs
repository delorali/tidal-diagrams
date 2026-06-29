#!/usr/bin/env node
// Build a Tidal Diagrams deep-link from quick-text on stdin.
//
//   echo "<quick-text>" | node scripts/diagram-link.mjs --title "My diagram"
//
// Prints a single URL whose fragment carries the diagram. Opening it in a
// Tidal Diagrams app loads the diagram (see src/diagram/urlLoad.ts).
//
// Target host resolution (first match wins):
//   1. --host <url>
//   2. $TIDAL_HOST
//   3. the hosted app, when run as an installed plugin ($CLAUDE_PLUGIN_ROOT set)
//   4. http://localhost:<port>  (--port / $TIDAL_PORT, default 5173) for local dev

import { readFileSync } from "node:fs";

const HOSTED = "https://tidal-diagrams.vercel.app";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const source = readFileSync(0, "utf8").replace(/\s+$/, "");
if (!source.trim()) {
  console.error("No quick-text supplied on stdin.");
  process.exit(1);
}

const port = arg("--port", process.env.TIDAL_PORT || "5173");
const defaultHost =
  process.env.TIDAL_HOST || (process.env.CLAUDE_PLUGIN_ROOT ? HOSTED : `http://localhost:${port}`);
const host = arg("--host", defaultHost).replace(/\/+$/, "");
const title = arg("--title", "");
const direction = arg("--direction", ""); // LR | TB | RL | BT — overrides any `direction` line
const aspect = arg("--aspect", ""); // e.g. 4:3, 16:9, 1.5 — best-effort layout fit

const payload = Buffer.from(source, "utf8").toString("base64url");
const params =
  (title ? `&title=${encodeURIComponent(title)}` : "") +
  (direction ? `&dir=${encodeURIComponent(direction.toUpperCase())}` : "") +
  (aspect ? `&fit=${encodeURIComponent(aspect)}` : "");
process.stdout.write(`${host}/#t=${payload}${params}\n`);
