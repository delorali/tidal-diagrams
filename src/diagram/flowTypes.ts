import { TidalActivationNode, TidalAnchorNode, TidalCardNode, TidalCylinderNode, TidalGroupNode, TidalPillNode } from "./nodes";
import { TidalEdge } from "./TidalEdge";

export const nodeTypes = {
  tidalCard: TidalCardNode,
  tidalCylinder: TidalCylinderNode,
  tidalPill: TidalPillNode,
  tidalGroup: TidalGroupNode,
  tidalAnchor: TidalAnchorNode,
  tidalActivation: TidalActivationNode,
};

export const edgeTypes = { tidal: TidalEdge };
