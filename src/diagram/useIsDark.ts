import { useSyncExternalStore } from "react";

/** Subscribe to the `.dark` class on <html> (toggled by the theme switch). */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains("dark");

/**
 * `true` when dark mode is active, re-rendering on toggle. Used where a value
 * must be picked in JS (e.g. SVG stroke colors) rather than via a `.dark` CSS rule.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
