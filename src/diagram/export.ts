import { getNodesBounds, getViewportForBounds, type ReactFlowInstance } from "@xyflow/react";
import { toBlob, toPng, toSvg } from "html-to-image";

type CaptureOptions = Parameters<typeof toPng>[1];

function captureSetup(
  rf: ReactFlowInstance,
  aspect?: number,
): { el: HTMLElement; options: CaptureOptions; restore: () => void } {
  const bounds = getNodesBounds(rf.getNodes());
  const pad = 48;
  let width = Math.ceil(bounds.width + pad * 2);
  let height = Math.ceil(bounds.height + pad * 2);
  // Pad the frame out to a target aspect ratio; the content stays centered
  // inside it (getViewportForBounds fits + centers the bounds).
  if (aspect && aspect > 0) {
    if (width / height < aspect) width = Math.ceil(height * aspect);
    else height = Math.ceil(width / aspect);
  }
  const viewport = getViewportForBounds(bounds, width, height, 0.1, 4, 0.06);

  const el = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!el) throw new Error("Canvas not found");

  const canvasBg = getComputedStyle(document.documentElement).getPropertyValue("--surface-canvas").trim();

  const options: CaptureOptions = {
    backgroundColor: canvasBg || "#ffffff",
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    filter: (node: HTMLElement) =>
      !node.classList?.contains("react-flow__attribution") &&
      !node.classList?.contains("react-flow__handle"),
  };

  // html-to-image doesn't resolve class-based CSS on SVG elements in the clone,
  // so bake the computed fill/stroke into inline styles for the capture.
  const svgEls = el.querySelectorAll<SVGElement>(".tidal-cylinder, .tidal-cylinder *");
  const savedStyles: [SVGElement, string | null][] = [];
  svgEls.forEach((e) => {
    const cs = getComputedStyle(e);
    savedStyles.push([e, e.getAttribute("style")]);
    e.style.fill = cs.fill;
    e.style.stroke = cs.stroke;
    e.style.strokeWidth = cs.strokeWidth;
  });

  return {
    el,
    options,
    restore: () =>
      savedStyles.forEach(([e, style]) =>
        style === null ? e.removeAttribute("style") : e.setAttribute("style", style),
      ),
  };
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  link.click();
}

export async function exportDiagram(
  rf: ReactFlowInstance,
  format: "png" | "svg",
  opts: { aspect?: number; aspectLabel?: string } = {},
) {
  const { el, options, restore } = captureSetup(rf, opts.aspect);
  let dataUrl: string;
  try {
    dataUrl =
      format === "png" ? await toPng(el, { ...options, pixelRatio: 2 }) : await toSvg(el, options);
  } finally {
    restore();
  }
  const suffix = opts.aspectLabel ? `-${opts.aspectLabel.replace(/[:/]/g, "x")}` : "";
  triggerDownload(dataUrl, `tidal-diagram${suffix}.${format}`);
}

/** Render the diagram to PNG and put it on the clipboard (no download involved). */
export async function copyDiagramPng(rf: ReactFlowInstance) {
  const { el, options, restore } = captureSetup(rf);
  const blobPromise = toBlob(el, { ...options, pixelRatio: 2 })
    .then((b) => {
      if (!b) throw new Error("Could not render the diagram");
      return b;
    })
    .finally(restore);
  // Pass the promise into ClipboardItem so the copy stays within the user gesture.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
}
