import { EditorView, type Extension } from "@codemirror/view";

/**
 * Middle-click drag to pan-scroll (Linux / VS Code style).
 * Prevents the default primary-selection paste on middle click while dragging.
 */
export function middleClickScroll(): Extension {
  return EditorView.domEventHandlers({
    auxclick(event) {
      if (event.button === 1) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    mousedown(event, view) {
      if (event.button !== 1) return false;

      event.preventDefault();
      event.stopPropagation();

      let lastX = event.clientX;
      let lastY = event.clientY;
      const scrollEl = view.scrollDOM;
      const prevCursor = scrollEl.style.cursor;
      scrollEl.style.cursor = "grabbing";

      const onMove = (e: MouseEvent) => {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        scrollEl.scrollLeft -= dx;
        scrollEl.scrollTop -= dy;
      };

      const onUp = (e: MouseEvent) => {
        if (e.button !== 1) return;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        scrollEl.style.cursor = prevCursor;
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return true;
    },
  });
}
