/**
 * Per-node color palette (a curated set of Tailwind hues). Each hue maps to the
 * shades the node uses, as [light, dark] pairs so the value inverts with theme:
 *
 *   fill   (solid bg)      shade-50  / shade-900
 *   border (solid+outline) shade-400 / shade-600
 *   ghost  (text)          shade-800 / shade-300
 *
 * Rendering: NodeColorVars below are written as inline CSS variables on the node
 * (both light and dark values), and index.css picks the right one via `.dark`.
 */

export interface ColorShades {
  /** [light, dark] for solid background. */
  fill: [string, string];
  /** [light, dark] for the border (solid + outline). */
  border: [string, string];
  /** [light, dark] for ghost text. */
  ghost: [string, string];
}

/** Tailwind v3 hex values: [50, 900], [400, 600], [800, 300]. */
export const NODE_COLORS: Record<string, ColorShades> = {
  slate: { fill: ["#f8fafc", "#0f172a"], border: ["#94a3b8", "#475569"], ghost: ["#1e293b", "#cbd5e1"] },
  red: { fill: ["#fef2f2", "#7f1d1d"], border: ["#f87171", "#dc2626"], ghost: ["#991b1b", "#fca5a5"] },
  orange: { fill: ["#fff7ed", "#7c2d12"], border: ["#fb923c", "#ea580c"], ghost: ["#9a3412", "#fdba74"] },
  amber: { fill: ["#fffbeb", "#78350f"], border: ["#fbbf24", "#d97706"], ghost: ["#92400e", "#fcd34d"] },
  yellow: { fill: ["#fefce8", "#713f12"], border: ["#facc15", "#ca8a04"], ghost: ["#854d0e", "#fde047"] },
  lime: { fill: ["#f7fee7", "#365314"], border: ["#a3e635", "#65a30d"], ghost: ["#3f6212", "#bef264"] },
  green: { fill: ["#f0fdf4", "#14532d"], border: ["#4ade80", "#16a34a"], ghost: ["#166534", "#86efac"] },
  emerald: { fill: ["#ecfdf5", "#064e3b"], border: ["#34d399", "#059669"], ghost: ["#065f46", "#6ee7b7"] },
  teal: { fill: ["#f0fdfa", "#134e4a"], border: ["#2dd4bf", "#0d9488"], ghost: ["#115e59", "#5eead4"] },
  cyan: { fill: ["#ecfeff", "#164e63"], border: ["#22d3ee", "#0891b2"], ghost: ["#155e75", "#67e8f9"] },
  sky: { fill: ["#f0f9ff", "#0c4a6e"], border: ["#38bdf8", "#0284c7"], ghost: ["#075985", "#7dd3fc"] },
  blue: { fill: ["#eff6ff", "#1e3a8a"], border: ["#60a5fa", "#2563eb"], ghost: ["#1e40af", "#93c5fd"] },
  indigo: { fill: ["#eef2ff", "#312e81"], border: ["#818cf8", "#4f46e5"], ghost: ["#3730a3", "#a5b4fc"] },
  violet: { fill: ["#f5f3ff", "#4c1d95"], border: ["#a78bfa", "#7c3aed"], ghost: ["#5b21b6", "#c4b5fd"] },
  purple: { fill: ["#faf5ff", "#581c87"], border: ["#c084fc", "#9333ea"], ghost: ["#6b21a8", "#d8b4fe"] },
  fuchsia: { fill: ["#fdf4ff", "#701a75"], border: ["#e879f9", "#c026d3"], ghost: ["#86198f", "#f0abfc"] },
  pink: { fill: ["#fdf2f8", "#831843"], border: ["#f472b6", "#db2777"], ghost: ["#9d174d", "#f9a8d4"] },
  rose: { fill: ["#fff1f2", "#881337"], border: ["#fb7185", "#e11d48"], ghost: ["#9f1239", "#fda4af"] },
};

export type NodeColor = keyof typeof NODE_COLORS;

/** Display order for the Inspector swatch grid. */
export const NODE_COLOR_ORDER = Object.keys(NODE_COLORS) as NodeColor[];

/** A representative dot color for the Inspector swatch (the light border shade). */
export function swatchColor(c: NodeColor): string {
  return NODE_COLORS[c].border[0];
}

/** Inline CSS variables (light + dark pairs) consumed by index.css color rules. */
export function nodeColorVars(c: NodeColor): Record<string, string> {
  const s = NODE_COLORS[c];
  return {
    "--nc-fill": s.fill[0],
    "--nc-fill-d": s.fill[1],
    "--nc-border": s.border[0],
    "--nc-border-d": s.border[1],
    "--nc-ghost": s.ghost[0],
    "--nc-ghost-d": s.ghost[1],
  };
}
