import { get } from "svelte/store";
import { workbench } from "$lib/stores/workbench";

export type ShortcutHandlers = {
  toggleChat: () => void;
  toggleExplorer: () => void;
  toggleBottom: () => void;
  openSettings: () => void;
  newTerminal: () => void | Promise<void>;
  newPreview: () => void;
  closeAllWorkbench: () => void | Promise<void>;
};

function ignoreTarget(ev: EventTarget | null): boolean {
  if (!(ev instanceof HTMLElement)) return false;
  const tag = ev.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(ev.closest(".cm-editor")) || Boolean(ev.closest(".xterm"));
}

/** Returns true if a shortcut was handled (caller should not propagate). */
export function dispatchWorkbenchShortcut(ev: KeyboardEvent, h: ShortcutHandlers): boolean {
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;

  if (ev.altKey && ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
    if (key === "t") {
      if (ignoreTarget(ev.target)) return false;
      ev.preventDefault();
      void h.newTerminal();
      return true;
    }
    if (key === "p") {
      if (ignoreTarget(ev.target)) return false;
      ev.preventDefault();
      h.newPreview();
      return true;
    }
    if (key === "x") {
      if (ignoreTarget(ev.target)) return false;
      ev.preventDefault();
      void h.closeAllWorkbench();
      return true;
    }
  }

  const mod = ev.ctrlKey || ev.metaKey;
  if (!mod) return false;

  if (mod && (ev.key === "," || ev.code === "Comma")) {
    ev.preventDefault();
    h.openSettings();
    return true;
  }

  if ((key === "w" || key === "W") && mod && !ev.shiftKey) {
    if (ignoreTarget(ev.target)) return false;
    const id = get(workbench).activeTabId;
    if (!id) return false;
    ev.preventDefault();
    workbench.closeTab(id);
    return true;
  }

  if ((key === "b" || key === "B") && mod && !ev.shiftKey) {
    if (ignoreTarget(ev.target)) return false;
    ev.preventDefault();
    h.toggleChat();
    return true;
  }

  if ((key === "e" || key === "E") && mod && ev.shiftKey) {
    if (ignoreTarget(ev.target)) return false;
    ev.preventDefault();
    h.toggleExplorer();
    return true;
  }

  if ((key === "j" || key === "J") && mod && !ev.shiftKey) {
    if (ignoreTarget(ev.target)) return false;
    ev.preventDefault();
    h.toggleBottom();
    return true;
  }

  if (key === "`" && mod && ev.shiftKey) {
    if (ignoreTarget(ev.target)) return false;
    ev.preventDefault();
    void h.newTerminal();
    return true;
  }

  return false;
}
