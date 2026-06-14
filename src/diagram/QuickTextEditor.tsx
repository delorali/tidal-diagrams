import { useEffect, useRef } from "react";
import {
  Decoration,
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { EditorState, type Range } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { parseQuickText } from "./quicktext";

const opMark = Decoration.mark({ class: "cm-qt-op" });
const labelMark = Decoration.mark({ class: "cm-qt-label" });
const tagMark = Decoration.mark({ class: "cm-qt-tag" });
const slashMark = Decoration.mark({ class: "cm-qt-slash" });
const nodeMark = Decoration.mark({ class: "cm-qt-node" });
const groupMark = Decoration.mark({ class: "cm-qt-group" });
const commentMark = Decoration.mark({ class: "cm-qt-comment" });
const directionMark = Decoration.mark({ class: "cm-qt-direction" });
const errorLine = Decoration.line({ class: "cm-qt-error" });

const TOKEN_RE =
  /(\|[^|]*\|)|(<->|<\.\.>|<\.\.|<-|-\.->|-->|->|\.\.>|---|--|\.\.)|([#@][\w-]+)|(\s\/\s)|(,)/g;
const OP_RE = /(<->|<\.\.>|<\.\.|<-|-\.->|-->|->|\.\.>|---|--|\.\.)/;
const DIR_WORDS = ["lr", "tb", "rl", "bt", "right", "down", "left", "up"];

function tokenizeLine(
  text: string,
  base: number,
  lineEnd: number,
  out: Range<Decoration>[],
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const leadStart = base + (text.length - text.trimStart().length);

  if (/^\s*\/\//.test(text)) {
    out.push(commentMark.range(leadStart, lineEnd));
    return;
  }
  const dl = trimmed.toLowerCase();
  if (/^direction\b/.test(dl) || DIR_WORDS.includes(dl)) {
    out.push(directionMark.range(leadStart, lineEnd));
    return;
  }
  if (trimmed.endsWith(":") && !OP_RE.test(text)) {
    out.push(groupMark.range(leadStart, lineEnd));
    return;
  }

  const pushNode = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b > a) out.push(nodeMark.range(base + a, base + b));
  };

  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = TOKEN_RE.exec(text))) {
    pushNode(last, m.index);
    const from = base + m.index;
    const to = from + m[0].length;
    if (m[1]) out.push(labelMark.range(from, to));
    else if (m[2]) out.push(opMark.range(from, to));
    else if (m[3]) out.push(tagMark.range(from, to));
    else if (m[4]) out.push(slashMark.range(from, to));
    // m[5] = comma: no mark
    last = m.index + m[0].length;
  }
  pushNode(last, text.length);
}

function computeDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const errorLines = new Set<number>();
  for (const d of parseQuickText(view.state.doc.toString()).diagnostics) {
    if (d.severity === "error") errorLines.add(d.line);
  }
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (errorLines.has(line.number - 1)) ranges.push(errorLine.range(line.from));
      tokenizeLine(line.text, line.from, line.to, ranges);
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = computeDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = computeDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", fontSize: "13px" },
  ".cm-scroller": { fontFamily: '"Geist Mono", ui-monospace, "SF Mono", monospace', lineHeight: "1.7" },
  ".cm-content": { padding: "14px 16px", caretColor: "var(--foreground)" },
  ".cm-focused": { outline: "none" },
  ".cm-line": { padding: "0" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "rgb(200 101 246 / 0.18)" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgb(200 101 246 / 0.18)" },
});

export function QuickTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          highlighter,
          cmPlaceholder(placeholder ?? ""),
          editorTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply external value changes (e.g. inserting a template) without disturbing
  // the caret during the user's own typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
