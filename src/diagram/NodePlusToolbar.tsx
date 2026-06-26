import { useState } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@liquidai/react";
import { useDiagramStore, type Side } from "./store";
import type { CreatableNodeType } from "./doc";

export const NODE_TYPE_OPTIONS: {
  type: Exclude<CreatableNodeType, "tidalGroup">;
  preset?: "header" | "rows";
  name: string;
  hint: string;
}[] = [
  { type: "tidalCard", name: "Node", hint: "Plain card with a mono label" },
  { type: "tidalCard", preset: "header", name: "Node with header", hint: "Title + muted suffix" },
  { type: "tidalCard", preset: "rows", name: "Node with rows", hint: "Header + label/value rows" },
  { type: "tidalPill", name: "Label", hint: "Glass pill annotation" },
  { type: "tidalCylinder", name: "Database", hint: "Cylinder shape" },
];

const SIDES: { side: Side; position: Position }[] = [
  { side: "r", position: Position.Right },
  { side: "b", position: Position.Bottom },
  { side: "l", position: Position.Left },
  { side: "t", position: Position.Top },
];

/** Flora-style hover "+" buttons that pull a connected node out of each side. */
export function NodePlus({ nodeId, selected }: { nodeId: string; selected: boolean }) {
  const hovered = useDiagramStore((s) => s.hoveredNodeId === nodeId);
  const spawn = useDiagramStore((s) => s.spawnConnectedNode);
  const [openSide, setOpenSide] = useState<Side | null>(null);

  return (
    <>
      {SIDES.map(({ side, position }) => (
        <NodeToolbar
          key={side}
          position={position}
          offset={16}
          isVisible={hovered || selected || openSide === side}
          // Clicks here (and in the portaled menu) bubble through React's tree
          // to the node wrapper, which would re-select the source node.
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu
            open={openSide === side}
            onOpenChange={(open) => setOpenSide(open ? side : null)}
          >
            <DropdownMenuTrigger asChild>
              <button className="tidal-plus nodrag nopan" aria-label={`Add connected node (${side})`}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {NODE_TYPE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.name}
                  onSelect={() => spawn(nodeId, side, opt.type, opt.preset)}
                >
                  <div className="flex flex-col">
                    <span>{opt.name}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </NodeToolbar>
      ))}
    </>
  );
}
