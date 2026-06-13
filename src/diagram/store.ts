import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createEdge,
  createNode,
  DOC_VERSION,
  newId,
  sortByParent,
  stripEphemeral,
  type CardData,
  type DiagramDoc,
  type DocMeta,
  type EdgeData,
  type TidalEdgeT,
  type TidalNode,
  type TidalNodeType,
} from "./doc";
import { normalizeEdges } from "./io";
import { measuredOrEstimate, tidyLayout } from "./tidy";

export type Side = "l" | "r" | "t" | "b";

export interface SpawnMenuState {
  /** Screen coordinates (relative to the canvas wrapper) for the menu. */
  screen: { x: number; y: number };
  /** Flow coordinates where a free-floating node should land (pane drop). */
  flow?: { x: number; y: number };
  /** Source node when spawning from a dropped connection. */
  fromNodeId?: string;
}

type Snapshot = { nodes: TidalNode[]; edges: TidalEdgeT[]; meta: DocMeta };

export interface DiagramState {
  nodes: TidalNode[];
  edges: TidalEdgeT[];
  meta: DocMeta;

  // ephemeral (excluded from persistence)
  hoveredNodeId: string | null;
  spawnMenu: SpawnMenuState | null;
  past: Snapshot[];
  future: Snapshot[];
  /** Bumped on loadDoc so the canvas can re-fit the viewport. */
  docRevision: number;

  onNodesChange: (changes: NodeChange<TidalNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<TidalEdgeT>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: TidalNodeType, position: { x: number; y: number }, preset?: "header" | "rows") => string;
  spawnConnectedNode: (fromNodeId: string, side: Side, type: TidalNodeType, preset?: "header" | "rows") => void;
  spawnAtPoint: (fromNodeId: string | undefined, flow: { x: number; y: number }, type: TidalNodeType, preset?: "header" | "rows") => void;
  updateNodeData: (id: string, patch: Partial<CardData> | ((data: CardData) => CardData)) => void;
  convertNodeType: (id: string, type: Exclude<TidalNodeType, "tidalGroup">) => void;
  updateEdgeData: (id: string, patch: Partial<EdgeData>) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  tidy: () => void;
  loadDoc: (doc: DiagramDoc) => void;
  setMeta: (patch: Partial<DocMeta>) => void;
  setHoveredNode: (id: string | null) => void;
  setSpawnMenu: (menu: SpawnMenuState | null) => void;
  undo: () => void;
  redo: () => void;
  endDrag: () => void;
}

const EMPTY_META: DocMeta = { version: DOC_VERSION, title: "Untitled diagram", direction: "LR" };

const PRESETS: Record<string, Partial<CardData>> = {
  header: { header: { title: "Title", suffix: "Suffix" }, label: undefined, rows: [] },
  rows: {
    header: { title: "Title" },
    label: undefined,
    rows: [
      { id: newId(), label: "Label", value: "Value" },
      { id: newId(), label: "Label", value: "Value" },
    ],
  },
};

const SPAWN_GAP = 90;
const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

// Coalescing bookkeeping for commit() — module-level, never rendered.
let lastCommitKey: string | null = null;
let lastCommitAt = 0;
let dragCommitted = false;

export const useDiagramStore = create<DiagramState>()(
  persist(
    (set, get) => {
      /**
       * Push the CURRENT doc onto the undo stack before a mutation.
       * Same-key commits within COALESCE_MS merge (e.g. a typing burst).
       */
      const commit = (key: string) => {
        const now = Date.now();
        if (key === lastCommitKey && now - lastCommitAt < COALESCE_MS) {
          lastCommitAt = now;
          return;
        }
        lastCommitKey = key;
        lastCommitAt = now;
        const { nodes, edges, meta } = get();
        const snapshot = { ...stripEphemeral(nodes, edges), meta } as Snapshot;
        set({ past: [...get().past.slice(-(HISTORY_LIMIT - 1)), snapshot], future: [] });
      };

      return {
        nodes: [],
        edges: [],
        meta: EMPTY_META,
        hoveredNodeId: null,
        spawnMenu: null,
        past: [],
        future: [],
        docRevision: 0,

        onNodesChange: (changes) => {
          // First positional change of a drag stores the pre-drag doc, once.
          if (!dragCommitted && changes.some((c) => c.type === "position" && c.dragging)) {
            commit(`drag-${Date.now()}`);
            dragCommitted = true;
          }
          set({ nodes: applyNodeChanges(changes, get().nodes) });
        },
        endDrag: () => {
          dragCommitted = false;
          lastCommitKey = null;
        },

        onEdgesChange: (changes) => {
          if (changes.some((c) => c.type === "remove")) commit("edge-remove");
          set({ edges: applyEdgeChanges(changes, get().edges) });
        },

        onConnect: (connection) => {
          if (!connection.source || !connection.target) return;
          if (connection.source === connection.target) return;
          const { nodes, edges } = get();
          const isGroup = (id: string) => nodes.find((n) => n.id === id)?.type === "tidalGroup";
          if (isGroup(connection.source) || isGroup(connection.target)) return;
          if (edges.some((e) => e.source === connection.source && e.target === connection.target)) return;
          commit(`connect-${newId()}`);
          const edge = createEdge(
            connection.source,
            connection.target,
            {},
            {
              sourceHandle: connection.sourceHandle ?? undefined,
              targetHandle: connection.targetHandle ?? undefined,
            },
          );
          set({ edges: normalizeEdges([...get().edges, edge]) });
        },

        addNode: (type, position, preset) => {
          commit(`add-${newId()}`);
          const node = createNode(type, position);
          if (preset && type === "tidalCard") {
            node.data = { ...(node.data as CardData), ...PRESETS[preset] };
          }
          set({
            nodes: sortByParent([
              ...get().nodes.map((n) => ({ ...n, selected: false })),
              { ...node, selected: true },
            ]),
          });
          return node.id;
        },

        spawnConnectedNode: (fromNodeId, side, type, preset) => {
          const from = get().nodes.find((n) => n.id === fromNodeId);
          if (!from) return;
          commit(`spawn-${newId()}`);
          const fw = from.measured?.width ?? 200;
          const fh = from.measured?.height ?? 46;
          const est = { width: 200, height: 46 };
          const offset = {
            l: { x: -(est.width + SPAWN_GAP), y: fh / 2 - est.height / 2 },
            r: { x: fw + SPAWN_GAP, y: fh / 2 - est.height / 2 },
            t: { x: fw / 2 - est.width / 2, y: -(est.height + SPAWN_GAP) },
            b: { x: fw / 2 - est.width / 2, y: fh + SPAWN_GAP },
          }[side];
          let position = { x: from.position.x + offset.x, y: from.position.y + offset.y };

          // Nudge until the slot is free (cheap intersection against sibling nodes).
          const siblings = get().nodes.filter((n) => n.parentId === from.parentId && n.id !== from.id);
          const collides = (p: { x: number; y: number }) =>
            siblings.some((n) => {
              const w = n.measured?.width ?? 200;
              const h = n.measured?.height ?? 46;
              return (
                p.x < n.position.x + w && p.x + est.width > n.position.x &&
                p.y < n.position.y + h && p.y + est.height > n.position.y
              );
            });
          const step = side === "l" || side === "r" ? { x: 0, y: 28 } : { x: 28, y: 0 };
          for (let i = 0; i < 40 && collides(position); i++) {
            position = { x: position.x + step.x, y: position.y + step.y };
          }

          const node = createNode(type, position);
          if (preset && type === "tidalCard") {
            node.data = { ...(node.data as CardData), ...PRESETS[preset] };
          }
          if (from.parentId) node.parentId = from.parentId;

          const along = side === "l" || side === "r";
          const [source, target, sh, th] =
            side === "r" || side === "b"
              ? [from.id, node.id, side, along ? "l" : "t"]
              : [node.id, from.id, along ? "r" : "b", side];
          const edge = createEdge(source, target, {}, { sourceHandle: sh, targetHandle: th });

          set({
            nodes: sortByParent([
              ...get().nodes.map((n) => ({ ...n, selected: false })),
              { ...node, selected: true },
            ]),
            edges: normalizeEdges([...get().edges, edge]),
            spawnMenu: null,
          });
        },

        spawnAtPoint: (fromNodeId, flow, type, preset) => {
          commit(`spawn-${newId()}`);
          const node = createNode(type, flow);
          if (preset && type === "tidalCard") {
            node.data = { ...(node.data as CardData), ...PRESETS[preset] };
          }
          const edges = fromNodeId
            ? normalizeEdges([...get().edges, createEdge(fromNodeId, node.id)])
            : get().edges;
          set({
            nodes: sortByParent([
              ...get().nodes.map((n) => ({ ...n, selected: false })),
              { ...node, selected: true },
            ]),
            edges,
            spawnMenu: null,
          });
        },

        updateNodeData: (id, patch) => {
          commit(`data-${id}`);
          set({
            nodes: get().nodes.map((n) =>
              n.id === id
                ? {
                    ...n,
                    data:
                      typeof patch === "function"
                        ? patch(n.data as CardData)
                        : { ...n.data, ...patch },
                  }
                : n,
            ),
          });
        },

        convertNodeType: (id, type) => {
          commit(`convert-${id}-${type}`);
          set({
            nodes: get().nodes.map((n) => {
              if (n.id !== id) return n;
              const d = n.data as CardData;
              const label = d.label || d.header?.title || "Node";
              // carry the fill across card/cylinder; pills are always ghost-like
              const fill = type === "tidalPill" ? undefined : d.fill;
              return {
                ...n,
                type,
                data:
                  type === "tidalCard"
                    ? { label, rows: d.rows ?? [], fill }
                    : type === "tidalCylinder"
                      ? { label, fill }
                      : { label },
                // drop stale measurements so the new shape re-measures cleanly
                measured: undefined,
              };
            }),
          });
        },

        updateEdgeData: (id, patch) => {
          commit(`edgedata-${id}`);
          set({
            edges: normalizeEdges(
              get().edges.map((e) =>
                e.id === id ? { ...e, data: { dotted: false, arrow: true, ...e.data, ...patch } } : e,
              ),
            ),
          });
        },

        deleteSelection: () => {
          const { nodes, edges } = get();
          const doomedNodes = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
          const hasDoomedEdges = edges.some((e) => e.selected);
          if (doomedNodes.size === 0 && !hasDoomedEdges) return;
          commit(`delete-${newId()}`);
          // cascade: children of deleted groups
          let grew = true;
          while (grew) {
            grew = false;
            for (const n of get().nodes) {
              if (n.parentId && doomedNodes.has(n.parentId) && !doomedNodes.has(n.id)) {
                doomedNodes.add(n.id);
                grew = true;
              }
            }
          }
          set({
            nodes: nodes.filter((n) => !doomedNodes.has(n.id)),
            edges: normalizeEdges(
              edges.filter((e) => !e.selected && !doomedNodes.has(e.source) && !doomedNodes.has(e.target)),
            ),
          });
        },

        duplicateSelection: () => {
          const selected = get().nodes.filter((n) => n.selected && n.type !== "tidalGroup");
          if (!selected.length) return;
          commit(`dup-${newId()}`);
          const clones = selected.map((n) => ({
            ...n,
            id: newId(),
            position: { x: n.position.x + 32, y: n.position.y + 32 },
            data: JSON.parse(JSON.stringify(n.data)),
            selected: true,
          }));
          set({
            nodes: sortByParent([...get().nodes.map((n) => ({ ...n, selected: false })), ...clones]),
          });
        },

        tidy: () => {
          commit(`tidy-${newId()}`);
          set({
            nodes: tidyLayout(get().nodes, get().edges, get().meta.direction, measuredOrEstimate),
          });
        },

        loadDoc: (doc) => {
          set({
            nodes: doc.nodes,
            edges: doc.edges,
            // imported/example docs get a fresh library identity unless they carry one
            meta: { ...doc.meta, docId: doc.meta.docId ?? newId() },
            hoveredNodeId: null,
            spawnMenu: null,
            past: [],
            future: [],
            docRevision: get().docRevision + 1,
          });
          lastCommitKey = null;
        },

        setMeta: (patch) => {
          commit("meta");
          set({ meta: { ...get().meta, ...patch } });
        },
        setHoveredNode: (id) => set({ hoveredNodeId: id }),
        setSpawnMenu: (menu) => set({ spawnMenu: menu }),

        undo: () => {
          const { past, future, nodes, edges, meta } = get();
          const prev = past[past.length - 1];
          if (!prev) return;
          const current = { ...stripEphemeral(nodes, edges), meta } as Snapshot;
          set({
            past: past.slice(0, -1),
            future: [current, ...future].slice(0, HISTORY_LIMIT),
            nodes: prev.nodes,
            edges: prev.edges,
            meta: prev.meta,
          });
          lastCommitKey = null;
        },

        redo: () => {
          const { past, future, nodes, edges, meta } = get();
          const next = future[0];
          if (!next) return;
          const current = { ...stripEphemeral(nodes, edges), meta } as Snapshot;
          set({
            past: [...past, current].slice(-HISTORY_LIMIT),
            future: future.slice(1),
            nodes: next.nodes,
            edges: next.edges,
            meta: next.meta,
          });
          lastCommitKey = null;
        },
      };
    },
    {
      name: "tidal-diagrams-doc",
      version: DOC_VERSION,
      partialize: (state) => ({
        ...stripEphemeral(state.nodes, state.edges),
        meta: state.meta,
      }),
    },
  ),
);

export const undo = () => useDiagramStore.getState().undo();
export const redo = () => useDiagramStore.getState().redo();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).tidalStore = useDiagramStore;
}
