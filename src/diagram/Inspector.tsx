import {
  Button,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SidePanel,
  SidePanelBody,
  SidePanelHeader,
  SidePanelSection,
  SidePanelSectionContent,
  SidePanelSectionHeader,
  SidePanelSectionTitle,
  SidePanelTitle,
  Switch,
  Label,
} from "@liquidai/react";
import type { CardData, EdgeData, TidalNodeType } from "./doc";
import { newId } from "./doc";
import { useDiagramStore } from "./store";

function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useDiagramStore((s) => s.nodes.find((n) => n.id === nodeId));
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  const convertNodeType = useDiagramStore((s) => s.convertNodeType);
  if (!node) return null;

  const data = node.data as CardData;
  const isCard = node.type === "tidalCard";
  const isGroup = node.type === "tidalGroup";

  return (
    <>
      {!isGroup && (
        <SidePanelSection>
          <SidePanelSectionHeader>
            <SidePanelSectionTitle>Type</SidePanelSectionTitle>
          </SidePanelSectionHeader>
          <SidePanelSectionContent>
            <Select
              value={node.type}
              onValueChange={(t) => convertNodeType(nodeId, t as Exclude<TidalNodeType, "tidalGroup">)}
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

export function Inspector() {
  const selectedNodeId = useDiagramStore((s) => s.nodes.find((n) => n.selected)?.id);
  const selectedEdgeId = useDiagramStore((s) => s.edges.find((e) => e.selected)?.id);

  return (
    <SidePanel
      side="right"
      width={280}
      className="absolute inset-y-0 right-0 z-20 !h-full overflow-y-auto border-l border-border bg-sidebar"
    >
      <SidePanelHeader>
        <SidePanelTitle>{selectedNodeId ? "Node" : selectedEdgeId ? "Edge" : "Diagram"}</SidePanelTitle>
      </SidePanelHeader>
      <SidePanelBody>
        {selectedNodeId ? (
          <NodeInspector nodeId={selectedNodeId} />
        ) : selectedEdgeId ? (
          <EdgeInspector edgeId={selectedEdgeId} />
        ) : (
          <DocInspector />
        )}
      </SidePanelBody>
    </SidePanel>
  );
}
