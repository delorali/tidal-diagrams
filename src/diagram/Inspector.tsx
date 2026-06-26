import {
  Button,
  Field,
  FieldControl,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SidePanel,
  SidePanelBody,
  SidePanelHeader,
  SidePanelHeaderActions,
  SidePanelSection,
  SidePanelSectionContent,
  SidePanelSectionHeader,
  SidePanelSectionTitle,
  SidePanelTitle,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  Label,
  cn,
} from "@liquidai/react";
import type { CardData, CreatableNodeType, EdgeData, NodeFill } from "./doc";
import { newId } from "./doc";
import { NODE_COLOR_ORDER, swatchColor, type NodeColor } from "./nodeColors";
import { useDiagramStore } from "./store";

function ColorSwatches({ value, onChange }: { value?: NodeColor; onChange: (c?: NodeColor) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        title="Default"
        aria-label="Default color"
        onClick={() => onChange(undefined)}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground",
          !value && "ring-2 ring-focus ring-offset-1 ring-offset-sidebar",
        )}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.4">
          <line x1="2.5" y1="9.5" x2="9.5" y2="2.5" />
        </svg>
      </button>
      {NODE_COLOR_ORDER.map((hue) => (
        <button
          key={hue}
          type="button"
          title={hue}
          aria-label={hue}
          onClick={() => onChange(hue)}
          style={{ backgroundColor: swatchColor(hue) }}
          className={cn(
            "h-5 w-5 rounded-full border border-black/10",
            value === hue && "ring-2 ring-focus ring-offset-1 ring-offset-sidebar",
          )}
        />
      ))}
    </div>
  );
}

function SizeRow({
  label,
  fixed,
  value,
  onHug,
  onFix,
}: {
  label: string;
  fixed: boolean;
  value: number;
  onHug: () => void;
  onFix: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-12 shrink-0 text-sm">{label}</Label>
      <ToggleGroup
        type="single"
        size="sm"
        value={fixed ? "fixed" : "hug"}
        onValueChange={(v) => {
          if (v === "hug") onHug();
          else if (v === "fixed") onFix(Math.max(1, value || 100));
        }}
        className="justify-start"
      >
        <ToggleGroupItem value="hug" className="flex-1">
          Hug
        </ToggleGroupItem>
        <ToggleGroupItem value="fixed" className="flex-1">
          Fixed
        </ToggleGroupItem>
      </ToggleGroup>
      {fixed && (
        <Input
          size="sm"
          type="number"
          className="w-16"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n) && n > 0) onFix(n);
          }}
        />
      )}
    </div>
  );
}

function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useDiagramStore((s) => s.nodes.find((n) => n.id === nodeId));
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  const convertNodeType = useDiagramStore((s) => s.convertNodeType);
  const bringToFront = useDiagramStore((s) => s.bringToFront);
  const sendToBack = useDiagramStore((s) => s.sendToBack);
  const setNodeSize = useDiagramStore((s) => s.setNodeSize);
  if (!node) return null;

  const data = node.data as CardData;
  const isCard = node.type === "tidalCard";
  const isGroup = node.type === "tidalGroup";
  const hasFill = isCard || node.type === "tidalCylinder";

  return (
    <>
      <SidePanelSection>
        <SidePanelSectionHeader>
          <SidePanelSectionTitle>Arrange</SidePanelSectionTitle>
        </SidePanelSectionHeader>
        <SidePanelSectionContent>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={bringToFront}>
              Bring to front
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={sendToBack}>
              Send to back
            </Button>
          </div>
        </SidePanelSectionContent>
      </SidePanelSection>

      {!isGroup && (
        <SidePanelSection>
          <SidePanelSectionHeader>
            <SidePanelSectionTitle>Size</SidePanelSectionTitle>
          </SidePanelSectionHeader>
          <SidePanelSectionContent className="space-y-2">
            <SizeRow
              label="Width"
              fixed={node.width != null}
              value={Math.round((node.width as number | undefined) ?? node.measured?.width ?? 0)}
              onHug={() => setNodeSize(nodeId, { width: null })}
              onFix={(n) => setNodeSize(nodeId, { width: n })}
            />
            <SizeRow
              label="Height"
              fixed={node.height != null}
              value={Math.round((node.height as number | undefined) ?? node.measured?.height ?? 0)}
              onHug={() => setNodeSize(nodeId, { height: null })}
              onFix={(n) => setNodeSize(nodeId, { height: n })}
            />
          </SidePanelSectionContent>
        </SidePanelSection>
      )}

      {!isGroup && (
        <SidePanelSection>
          <SidePanelSectionHeader>
            <SidePanelSectionTitle>Type</SidePanelSectionTitle>
          </SidePanelSectionHeader>
          <SidePanelSectionContent>
            <Select
              value={node.type}
              onValueChange={(t) => convertNodeType(nodeId, t as Exclude<CreatableNodeType, "tidalGroup">)}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tidalCard">Node</SelectItem>
                <SelectItem value="tidalPill">Label</SelectItem>
                <SelectItem value="tidalCylinder">Database</SelectItem>
              </SelectContent>
            </Select>
          </SidePanelSectionContent>
        </SidePanelSection>
      )}

      {hasFill && (
        <SidePanelSection>
          <SidePanelSectionHeader>
            <SidePanelSectionTitle>Fill</SidePanelSectionTitle>
          </SidePanelSectionHeader>
          <SidePanelSectionContent>
            <ToggleGroup
              type="single"
              size="sm"
              value={(data.fill ?? "solid") as NodeFill}
              onValueChange={(v) => v && updateNodeData(nodeId, { fill: v as NodeFill })}
              className="w-full justify-start"
            >
              <ToggleGroupItem value="solid" className="flex-1">
                Solid
              </ToggleGroupItem>
              <ToggleGroupItem value="outline" className="flex-1">
                Outline
              </ToggleGroupItem>
              <ToggleGroupItem value="ghost" className="flex-1">
                Ghost
              </ToggleGroupItem>
            </ToggleGroup>
          </SidePanelSectionContent>
        </SidePanelSection>
      )}

      {!isGroup && (
        <SidePanelSection>
          <SidePanelSectionHeader>
            <SidePanelSectionTitle>Color</SidePanelSectionTitle>
          </SidePanelSectionHeader>
          <SidePanelSectionContent>
            <ColorSwatches value={data.color} onChange={(c) => updateNodeData(nodeId, { color: c })} />
          </SidePanelSectionContent>
        </SidePanelSection>
      )}

      {isCard ? (
        <>
          <SidePanelSection>
            <SidePanelSectionHeader>
              <SidePanelSectionTitle>Header</SidePanelSectionTitle>
              <Switch
                checked={!!data.header}
                onCheckedChange={(on) =>
                  updateNodeData(nodeId, (d) => ({
                    ...d,
                    header: on ? { title: d.header?.title ?? d.label ?? "Title", suffix: "" } : undefined,
                  }))
                }
              />
            </SidePanelSectionHeader>
            {data.header && (
              <SidePanelSectionContent className="space-y-2">
                <Field>
                  <FieldLabel>Title</FieldLabel>
                  <FieldControl>
                    <Input size="sm"
                      value={data.header.title}
                      onChange={(e) =>
                        updateNodeData(nodeId, (d) => ({ ...d, header: { ...d.header!, title: e.target.value } }))
                      }
                    />
                  </FieldControl>
                </Field>
                <Field>
                  <FieldLabel>Suffix</FieldLabel>
                  <FieldControl>
                    <Input size="sm"
                      value={data.header.suffix ?? ""}
                      placeholder="Muted text after the title"
                      onChange={(e) =>
                        updateNodeData(nodeId, (d) => ({ ...d, header: { ...d.header!, suffix: e.target.value } }))
                      }
                    />
                  </FieldControl>
                </Field>
              </SidePanelSectionContent>
            )}
          </SidePanelSection>

          <SidePanelSection>
            <SidePanelSectionHeader>
              <SidePanelSectionTitle>Label</SidePanelSectionTitle>
              <Switch
                checked={data.label !== undefined}
                onCheckedChange={(on) =>
                  updateNodeData(nodeId, (d) => ({ ...d, label: on ? "Label" : undefined }))
                }
              />
            </SidePanelSectionHeader>
            {data.label !== undefined && (
              <SidePanelSectionContent>
                <Input size="sm"
                  value={data.label}
                  className="font-mono"
                  onChange={(e) => updateNodeData(nodeId, { label: e.target.value })}
                />
              </SidePanelSectionContent>
            )}
          </SidePanelSection>

          <SidePanelSection>
            <SidePanelSectionHeader>
              <SidePanelSectionTitle>Rows</SidePanelSectionTitle>
            </SidePanelSectionHeader>
            <SidePanelSectionContent className="space-y-3">
              {(data.rows ?? []).map((row) => (
                <div key={row.id} className="space-y-1.5 rounded-md border border-border p-2">
                  <Input size="sm"
                    value={row.label}
                    placeholder="Label"
                    onChange={(e) =>
                      updateNodeData(nodeId, (d) => ({
                        ...d,
                        rows: d.rows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)),
                      }))
                    }
                  />
                  <Input size="sm"
                    value={row.value}
                    placeholder="Value"
                    className="font-mono"
                    onChange={(e) =>
                      updateNodeData(nodeId, (d) => ({
                        ...d,
                        rows: d.rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)),
                      }))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-muted-foreground"
                    onClick={() =>
                      updateNodeData(nodeId, (d) => ({ ...d, rows: d.rows.filter((r) => r.id !== row.id) }))
                    }
                  >
                    Remove row
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  updateNodeData(nodeId, (d) => ({
                    ...d,
                    rows: [...(d.rows ?? []), { id: newId(), label: "Label", value: "Value" }],
                  }))
                }
              >
                Add row
              </Button>
            </SidePanelSectionContent>
          </SidePanelSection>
        </>
      ) : (
        <SidePanelSection>
          <SidePanelSectionHeader>
            <SidePanelSectionTitle>{isGroup ? "Group title" : "Label"}</SidePanelSectionTitle>
          </SidePanelSectionHeader>
          <SidePanelSectionContent>
            <Input size="sm"
              value={(node.data as { label: string }).label}
              onChange={(e) => updateNodeData(nodeId, { label: e.target.value })}
            />
          </SidePanelSectionContent>
        </SidePanelSection>
      )}
    </>
  );
}

const ARROW_MODES = [
  { value: "forward", label: "Forward  ⟶", arrow: true, arrowStart: false },
  { value: "backward", label: "Backward  ⟵", arrow: false, arrowStart: true },
  { value: "both", label: "Both ends  ⟷", arrow: true, arrowStart: true },
  { value: "none", label: "None  —", arrow: false, arrowStart: false },
] as const;

function EdgeInspector({ edgeId }: { edgeId: string }) {
  const edge = useDiagramStore((s) => s.edges.find((e) => e.id === edgeId));
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);
  if (!edge) return null;
  const data = edge.data as EdgeData;

  const arrowMode =
    ARROW_MODES.find((m) => m.arrow === data.arrow && m.arrowStart === !!data.arrowStart)?.value ??
    "forward";

  return (
    <SidePanelSection>
      <SidePanelSectionHeader>
        <SidePanelSectionTitle>Edge</SidePanelSectionTitle>
      </SidePanelSectionHeader>
      <SidePanelSectionContent className="space-y-3">
        <Field>
          <FieldLabel>Label</FieldLabel>
          <FieldControl>
            <Input size="sm"
              value={data.label ?? ""}
              placeholder="Shown in a glass pill"
              onChange={(e) => updateEdgeData(edgeId, { label: e.target.value || undefined })}
            />
          </FieldControl>
        </Field>
        <Field>
          <FieldLabel>Arrowheads</FieldLabel>
          <FieldControl>
            <Select
              value={arrowMode}
              onValueChange={(v) => {
                const mode = ARROW_MODES.find((m) => m.value === v)!;
                updateEdgeData(edgeId, { arrow: mode.arrow, arrowStart: mode.arrowStart });
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARROW_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldControl>
        </Field>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Dotted</Label>
          <Switch checked={data.dotted} onCheckedChange={(v) => updateEdgeData(edgeId, { dotted: v })} />
        </div>
        <Field>
          <FieldLabel>Color</FieldLabel>
          <FieldControl>
            <ColorSwatches value={data.color} onChange={(c) => updateEdgeData(edgeId, { color: c })} />
          </FieldControl>
        </Field>
      </SidePanelSectionContent>
    </SidePanelSection>
  );
}

function DocInspector() {
  const meta = useDiagramStore((s) => s.meta);
  const setMeta = useDiagramStore((s) => s.setMeta);
  const tidy = useDiagramStore((s) => s.tidy);

  return (
    <SidePanelSection>
      <SidePanelSectionContent className="space-y-3">
        <Field>
          <FieldLabel>Title</FieldLabel>
          <FieldControl>
            <Input size="sm" value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} />
          </FieldControl>
        </Field>
        <Field>
          <FieldLabel>Flow direction</FieldLabel>
          <FieldControl>
            <Select value={meta.direction} onValueChange={(d) => setMeta({ direction: d as typeof meta.direction })}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LR">Left → right</SelectItem>
                <SelectItem value="TB">Top → bottom</SelectItem>
                <SelectItem value="RL">Right → left</SelectItem>
                <SelectItem value="BT">Bottom → top</SelectItem>
              </SelectContent>
            </Select>
          </FieldControl>
        </Field>
        <Button variant="outline" size="sm" className="w-full" onClick={tidy}>
          Tidy layout
        </Button>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Select a node or edge to edit it. Double-click any text on the canvas to rename in place.
        </p>
      </SidePanelSectionContent>
    </SidePanelSection>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function MultiSelectInspector({ nodeCount, edgeCount }: { nodeCount: number; edgeCount: number }) {
  const parts = [
    nodeCount > 0 && `${nodeCount} node${nodeCount === 1 ? "" : "s"}`,
    edgeCount > 0 && `${edgeCount} edge${edgeCount === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <SidePanelSection>
      <SidePanelSectionContent className="space-y-2">
        <p className="font-sans text-sm text-foreground">{parts.join(" and ")} selected</p>
        <p className="font-sans text-sm leading-relaxed text-muted-foreground">
          Drag any selected node to move the whole selection, or press ⌫ to delete it. Select a
          single item to edit its properties.
        </p>
      </SidePanelSectionContent>
    </SidePanelSection>
  );
}

export function Inspector() {
  const selectedNodeIds = useDiagramStore((s) =>
    s.nodes.filter((n) => n.selected).map((n) => n.id).join(","),
  );
  const selectedEdgeIds = useDiagramStore((s) =>
    s.edges.filter((e) => e.selected).map((e) => e.id).join(","),
  );
  const deleteSelection = useDiagramStore((s) => s.deleteSelection);

  const nodeIds = selectedNodeIds ? selectedNodeIds.split(",") : [];
  const edgeIds = selectedEdgeIds ? selectedEdgeIds.split(",") : [];
  const total = nodeIds.length + edgeIds.length;
  const isMulti = total > 1;

  const title = isMulti
    ? `${total} selected`
    : nodeIds.length === 1
      ? "Node"
      : edgeIds.length === 1
        ? "Edge"
        : "Diagram";

  return (
    <SidePanel
      side="right"
      width={280}
      className="absolute inset-y-0 right-0 z-20 !h-full overflow-y-auto border-l border-border bg-sidebar"
    >
      <SidePanelHeader>
        <SidePanelTitle>{title}</SidePanelTitle>
        {total > 0 && (
          <SidePanelHeaderActions>
            <IconButton
              variant="ghost"
              tone="destructive"
              size="sm"
              aria-label={isMulti ? `Delete ${total} items` : nodeIds.length ? "Delete node" : "Delete edge"}
              onClick={deleteSelection}
            >
              <TrashIcon />
            </IconButton>
          </SidePanelHeaderActions>
        )}
      </SidePanelHeader>
      <SidePanelBody>
        {isMulti ? (
          <MultiSelectInspector nodeCount={nodeIds.length} edgeCount={edgeIds.length} />
        ) : nodeIds.length === 1 ? (
          <NodeInspector nodeId={nodeIds[0]} />
        ) : edgeIds.length === 1 ? (
          <EdgeInspector edgeId={edgeIds[0]} />
        ) : (
          <DocInspector />
        )}
      </SidePanelBody>
    </SidePanel>
  );
}
