#!/usr/bin/env node
// Build a Tidal Diagrams deep-link from quick-text on stdin.
//
//   echo "<quick-text>" | node scripts/diagram-link.mjs --title "My diagram"
//
// Prints a single URL whose fragment carries the diagram. Opening it in a
// running Tidal Diagrams app loads the diagram (see src/diagram/urlLoad.ts).
// The dev server port is auto-detected (Vite default 5173) or set with --port.

import { readFileSync } from "node:fs";

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
const host = arg("--host", `http://localhost:${port}`);
const title = arg("--title", "");
const direction = arg("--direction", ""); // LR | TB | RL | BT — overrides any `direction` line
const aspect = arg("--aspect", ""); // e.g. 4:3, 16:9, 1.5 — best-effort layout fit

const payload = Buffer.from(source, "utf8").toString("base64url");
const params =
  (title ? `&title=${encodeURIComponent(title)}` : "") +
  (direction ? `&dir=${encodeURIComponent(direction.toUpperCase())}` : "") +
  (aspect ? `&fit=${encodeURIComponent(aspect)}` : "");
process.stdout.write(`${host}/#t=${payload}${params}\n`);
