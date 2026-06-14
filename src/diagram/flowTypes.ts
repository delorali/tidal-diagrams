import { TidalCardNode, TidalCylinderNode, TidalGroupNode, TidalPillNode } from "./nodes";
import { TidalEdge } from "./TidalEdge";

export const nodeTypes = {
  tidalCard: TidalCardNode,
  tidalCylinder: TidalCylinderNode,
  tidalPill: TidalPillNode,
  tidalGroup: TidalGroupNode,
};

export const edgeTypes = { tidal: TidalEdge };
