import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function collectFocusable(node: HTMLElement | null): HTMLElement[] {
  if (!node) return [];
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("aria-hidden") && (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement),
  );
}

/**
 * Accessible modal dialog behaviour (Chặng 3 / A07–A12):
 *  - remembers the trigger element and returns focus on close,
 *  - moves focus into the dialog when it opens,
 *  - keeps Tab / Shift+Tab inside the dialog,
 *  - closes on Escape.
 *
 * Attach the returned ref to the dialog's inner container (the element that
 * carries role="dialog"). The hook only reacts to `open` so that re-renders
 * caused by parent state do not steal focus again.
 */
export function useAccessibleDialog<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  options?: { initialFocusSelector?: string },
) {
  const containerRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusSelector = options?.initialFocusSelector;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the dialog on the next frame so the DOM is painted.
    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const preferred = initialFocusSelector
        ? container.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      const target = preferred ?? collectFocusable(container)[0] ?? container;
      if (target === container && !container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: true });
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const items = collectFocusable(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const index = active ? items.indexOf(active) : -1;
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault();
          items[items.length - 1].focus({ preventScroll: true });
        }
      } else if (index === -1 || index === items.length - 1) {
        event.preventDefault();
        items[0].focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (previous && document.contains(previous) && typeof previous.focus === "function") {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocusSelector]);

  return containerRef;
}
