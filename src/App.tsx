import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldControl,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Textarea,
  Toaster,
  TooltipProvider,
  toast,
} from "@liquidai/react";
import { Canvas } from "./diagram/Canvas";
import { Inspector } from "./diagram/Inspector";
import { Toolbar } from "./diagram/Toolbar";
import { describeApiError, imageToMermaid } from "./diagram/imageImport";
import { parseMermaid } from "./diagram/parse";
import { detectUnsupportedDiagramType } from "./diagram/diagramType";
import { parseSequence } from "./diagram/sequence";
import { sequenceToDoc } from "./diagram/sequenceLayout";
import { docToJson, jsonToDoc, specToDoc } from "./diagram/io";
import { copyDiagramPng, exportDiagram } from "./diagram/export";
import { newId, stripForExport } from "./diagram/doc";
import { startLibrarySync } from "./diagram/library";
import { HomePage } from "./Home";
import { TextPanel } from "./diagram/TextPanel";
import { redo, undo, useDiagramStore } from "./diagram/store";
import { useShortcuts } from "./diagram/useShortcuts";
import { EXAMPLES } from "./examples";

function MermaidImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const loadDoc = useDiagramStore((s) => s.loadDoc);

  const doImport = () => {
    // Sequence diagrams take a different path: parse → lay out as editable
    // lifelines/messages/notes → load. Everything else is a flowchart.
    if (detectUnsupportedDiagramType(source)?.keyword === "sequenceDiagram") {
      const { spec, warnings } = parseSequence(source);
      if (spec.participants.length === 0) {
        setErrors(["No participants found in the sequence diagram."]);
        return;
      }
      loadDoc(sequenceToDoc(spec));
      setErrors(warnings.map((w) => `Line ${w.line}: ${w.message}`));
      if (warnings.length === 0) {
        onOpenChange(false);
        setSource("");
      }
      return;
    }
    const { spec, errors } = parseMermaid(source);
    if (spec.nodes.length === 0) {
      setErrors(errors.length ? errors : ["No nodes found in the source."]);
      return;
    }
    loadDoc(specToDoc(spec));
    setErrors(errors);
    if (errors.length === 0) {
      onOpenChange(false);
      setSource("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Mermaid</DialogTitle>
          <DialogDescription>
            Paste a Mermaid flowchart or sequence diagram. It replaces the current diagram and becomes fully editable.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          placeholder={"flowchart LR\n  a[Start] -->|label| b[Finish]"}
          className="h-56 resize-none font-mono text-[13px] leading-relaxed"
        />
        {errors.map((err, i) => (
          <p key={i} className="font-mono text-sm text-status-error">
            {err}
          </p>
        ))}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={doImport} disabled={!source.trim()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const API_KEY_STORAGE = "tidal-diagrams-anthropic-key";

function ImageImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mermaid, setMermaid] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const loadDoc = useDiagramStore((s) => s.loadDoc);

  const pickFile = (f: File | null) => {
    setFile(f);
    setMermaid("");
    setError(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    const f = item?.getAsFile();
    if (f) {
      e.preventDefault();
      pickFile(f);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (f) pickFile(f);
  };

  const generate = async () => {
    if (!file || !apiKey.trim()) return;
    localStorage.setItem(API_KEY_STORAGE, apiKey.trim());
    setBusy(true);
    setError(null);
    try {
      const result = await imageToMermaid(apiKey.trim(), file);
      setMermaid(result.mermaid);
      // Sequence diagrams are valid here; only surface flowchart parse warnings.
      if (detectUnsupportedDiagramType(result.mermaid)?.keyword !== "sequenceDiagram") {
        const { errors } = parseMermaid(result.mermaid);
        if (errors.length) setError(`Transcribed with warnings: ${errors[0]}`);
      }
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const doImport = () => {
    if (detectUnsupportedDiagramType(mermaid)?.keyword === "sequenceDiagram") {
      const { spec } = parseSequence(mermaid);
      if (spec.participants.length === 0) {
        setError("No participants found in the generated sequence diagram.");
        return;
      }
      loadDoc(sequenceToDoc(spec, file?.name.replace(/\.\w+$/, "") || "Sequence diagram"));
      onOpenChange(false);
      pickFile(null);
      return;
    }
    const { spec, errors } = parseMermaid(mermaid);
    if (spec.nodes.length === 0) {
      setError(errors[0] ?? "No nodes found in the generated code.");
      return;
    }
    loadDoc(specToDoc(spec, file?.name.replace(/\.\w+$/, "") || "Imported diagram"));
    onOpenChange(false);
    pickFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onPaste={onPaste}>
        <DialogHeader>
          <DialogTitle>Import from image</DialogTitle>
          <DialogDescription>
            Claude transcribes a screenshot of a diagram (Mermaid, Excalidraw, whiteboard…) into an
            editable Tidal diagram. Your API key is stored locally and sent only to Anthropic.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-4 py-3 font-sans text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            {file ? (
              <span className="truncate text-foreground">{file.name}</span>
            ) : (
              <span>
                Paste a screenshot (⌘V), drop an image here, or <span className="underline">browse…</span>
              </span>
            )}
            <span className="text-sm">PNG, JPEG, WebP, or GIF</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          {previewUrl && !mermaid && (
            <img
              src={previewUrl}
              alt="Diagram to import"
              className="max-h-64 w-full rounded-md border border-border object-contain"
            />
          )}

          <Field>
            <FieldLabel>Anthropic API key</FieldLabel>
            <FieldControl>
              <Input
                type="password"
                value={apiKey}
                placeholder="sk-ant-…"
                onChange={(e) => setApiKey(e.target.value)}
              />
            </FieldControl>
          </Field>

          {mermaid && (
            <Textarea
              value={mermaid}
              onChange={(e) => setMermaid(e.target.value)}
              spellCheck={false}
              className="h-48 resize-none font-mono text-[13px] leading-relaxed"
            />
          )}

          {error && <p className="font-mono text-sm text-status-error">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mermaid ? (
            <>
              <Button variant="outline" onClick={generate} disabled={busy || !file || !apiKey.trim()}>
                {busy ? "Regenerating…" : "Regenerate"}
              </Button>
              <Button onClick={doImport}>Import diagram</Button>
            </>
          ) : (
            <Button onClick={generate} disabled={busy || !file || !apiKey.trim()}>
              {busy ? "Transcribing…" : "Generate diagram"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeaderBar({
  dark,
  onDarkChange,
  onOpenMermaid,
  onOpenImage,
  onImportJson,
  onGoHome,
}: {
  dark: boolean;
  onDarkChange: (v: boolean) => void;
  onOpenMermaid: () => void;
  onOpenImage: () => void;
  onImportJson: () => void;
  onGoHome: () => void;
}) {
  const rf = useReactFlow();
  const loadDoc = useDiagramStore((s) => s.loadDoc);
  const canUndo = useDiagramStore((s) => s.past.length > 0);
  const canRedo = useDiagramStore((s) => s.future.length > 0);

  const exportJson = () => {
    const { nodes, edges, meta } = useDiagramStore.getState();
    const blob = new Blob([docToJson({ meta, ...stripForExport(nodes, edges) })], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.download = `${meta.title.replace(/\s+/g, "-").toLowerCase() || "diagram"}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const loadExample = (id: string) => {
    const example = EXAMPLES.find((e) => e.id === id);
    if (!example) return;
    const { spec } = parseMermaid(example.source);
    loadDoc(specToDoc(spec, example.name));
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4">
      <button className="flex items-center gap-2" onClick={onGoHome} aria-label="Back to home">
        <span className="font-sans text-sm font-semibold">Tidal Diagrams</span>
        <Badge variant="secondary">beta</Badge>
      </button>
      <Separator orientation="vertical" className="h-5" />
      <Select value="" onValueChange={loadExample}>
        <SelectTrigger size="sm" className="w-44">
          <SelectValue placeholder="Examples…" />
        </SelectTrigger>
        <SelectContent>
          {EXAMPLES.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={!canUndo} onClick={() => undo()}>
          Undo
        </Button>
        <Button variant="ghost" size="sm" disabled={!canRedo} onClick={() => redo()}>
          Redo
        </Button>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch id="dark-mode" checked={dark} onCheckedChange={onDarkChange} />
          <Label htmlFor="dark-mode" className="text-sm text-muted-foreground">
            Dark
          </Label>
        </div>
        <Separator orientation="vertical" className="h-5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Import
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpenMermaid}>Mermaid…</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenImage}>Image…</DropdownMenuItem>
            <DropdownMenuItem onSelect={onImportJson}>JSON file…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">Export</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                copyDiagramPng(rf)
                  .then(() => toast.success("PNG copied — paste it anywhere"))
                  .catch((e) => toast.error(`Copy failed: ${e instanceof Error ? e.message : e}`))
              }
            >
              Copy PNG to clipboard
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                exportDiagram(rf, "png").then(() => toast.success("Downloading tidal-diagram.png"))
              }
            >
              PNG file
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                exportDiagram(rf, "svg").then(() => toast.success("Downloading tidal-diagram.svg"))
              }
            >
              SVG file
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportJson}>JSON file</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default function App() {
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [view, setView] = useState<"home" | "editor">("home");
  const [textPanelOpen, setTextPanelOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const loadDoc = useDiagramStore((s) => s.loadDoc);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  useShortcuts(view === "editor");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // First run (no persisted doc): seed with the flagship example.
  useEffect(() => {
    if (localStorage.getItem("tidal-diagrams-doc")) return;
    const { spec } = parseMermaid(EXAMPLES[1].source);
    loadDoc(specToDoc(spec, EXAMPLES[1].name));
  }, [loadDoc]);

  // Adopt pre-library docs into the library, then mirror edits into it.
  useEffect(() => {
    const { meta, setMeta } = useDiagramStore.getState();
    if (!meta.docId) setMeta({ docId: newId() });
    return startLibrarySync();
  }, []);

  // Any loadDoc (new, open, import, example) lands you in the editor.
  // Declared after the seed effect so the initial seed doesn't trigger it.
  const docRevision = useDiagramStore((s) => s.docRevision);
  const seenRevision = useRef<number | null>(null);
  useEffect(() => {
    if (seenRevision.current === null) {
      // read live state, not the render-bound value: the first-run seed effect
      // has already bumped the revision by the time this effect runs
      seenRevision.current = useDiagramStore.getState().docRevision;
      return;
    }
    if (docRevision !== seenRevision.current) {
      seenRevision.current = docRevision;
      setView("editor");
    }
  }, [docRevision]);

  const importJsonFile = async (file: File) => {
    try {
      loadDoc(jsonToDoc(await file.text()));
    } catch (err) {
      toast.error(`Could not import: ${err instanceof Error ? err.message : err}`);
    }
  };

  return (
    <ReactFlowProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
          {view === "home" ? (
            <HomePage
              dark={dark}
              onDarkChange={setDark}
              onOpenMermaid={() => setMermaidOpen(true)}
              onOpenImage={() => setImageOpen(true)}
              onImportJson={() => jsonFileRef.current?.click()}
            />
          ) : (
            <>
              <HeaderBar
                dark={dark}
                onDarkChange={setDark}
                onOpenMermaid={() => setMermaidOpen(true)}
                onOpenImage={() => setImageOpen(true)}
                onImportJson={() => jsonFileRef.current?.click()}
                onGoHome={() => setView("home")}
              />
              <div className="relative min-h-0 flex-1">
                {/* canvas stops at the inspector so fitView centers in the visible area */}
                <main className="absolute inset-y-0 left-0 right-[280px]">
                  <Canvas />
                  <Toolbar />
                  {!textPanelOpen && (
                    <button
                      className="tidal-text-toggle absolute left-3 top-3 z-10"
                      aria-label="Open diagram text"
                      onClick={() => setTextPanelOpen(true)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 6h12M8 12h12M8 18h8" />
                        <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                      </svg>
                    </button>
                  )}
                  {textPanelOpen && <TextPanel onClose={() => setTextPanelOpen(false)} />}
                </main>
                <Inspector />
              </div>
            </>
          )}
        </div>
        <input
          ref={jsonFileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJsonFile(f);
            e.target.value = "";
          }}
        />
        <MermaidImportDialog open={mermaidOpen} onOpenChange={setMermaidOpen} />
        <ImageImportDialog open={imageOpen} onOpenChange={setImageOpen} />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ReactFlowProvider>
  );
}
