import { writable, derived } from "svelte/store";
import { normalizeFilePath } from "../fsPath";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[];
  expanded?: boolean;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
  /** When set, editor highlights lines changed vs this base (e.g. git HEAD). */
  diffBase?: string;
  /** Buffer only — not written to disk until save (New file). */
  pendingOnDisk?: boolean;
}

function createFilesStore() {
  const { subscribe, set, update } = writable<{
    tree: FileEntry[];
    openFiles: OpenFile[];
    activeFilePath: string | null;
    workspacePath: string | null;
  }>({
    tree: [],
    openFiles: [],
    activeFilePath: null,
    workspacePath: null,
  });

  return {
    subscribe,
    setTree: (tree: FileEntry[]) => {
      update((state) => ({ ...state, tree }));
    },
    setWorkspacePath: (path: string) => {
      update((state) => ({ ...state, workspacePath: normalizeFilePath(path) }));
    },
    toggleExpanded: (path: string) => {
      const key = normalizeFilePath(path);
      update((state) => {
        const toggleInTree = (entries: FileEntry[]): FileEntry[] => {
          return entries.map((entry) => {
            if (normalizeFilePath(entry.path) === key) {
              return { ...entry, expanded: !entry.expanded };
            }
            if (entry.children) {
              return { ...entry, children: toggleInTree(entry.children) };
            }
            return entry;
          });
        };
        return { ...state, tree: toggleInTree(state.tree) };
      });
    },
    setChildren: (path: string, children: FileEntry[]) => {
      const key = normalizeFilePath(path);
      update((state) => {
        const mergeChildren = (
          previous: FileEntry[] | undefined,
          next: FileEntry[]
        ): FileEntry[] => {
          if (!previous?.length) return next;
          const previousByPath = new Map(
            previous.map((entry) => [normalizeFilePath(entry.path), entry])
          );
          return next.map((entry) => {
            const old = previousByPath.get(normalizeFilePath(entry.path));
            if (old?.expanded && old.children) {
              return { ...entry, expanded: true, children: old.children };
            }
            return entry;
          });
        };

        const setInTree = (entries: FileEntry[]): FileEntry[] => {
          return entries.map((entry) => {
            if (normalizeFilePath(entry.path) === key) {
              return {
                ...entry,
                children: mergeChildren(entry.children, children),
                expanded: true,
              };
            }
            if (entry.children) {
              return { ...entry, children: setInTree(entry.children) };
            }
            return entry;
          });
        };
        return { ...state, tree: setInTree(state.tree) };
      });
    },
    openFile: (file: OpenFile) => {
      const canon = normalizeFilePath(file.path);
      const stored: OpenFile = { ...file, path: canon };
      update((state) => {
        const exists = state.openFiles.find((f) => normalizeFilePath(f.path) === canon);
        if (exists) {
          return {
            ...state,
            activeFilePath: canon,
            openFiles: state.openFiles.map((f) =>
              normalizeFilePath(f.path) === canon ? { ...stored } : f
            ),
          };
        }
        return {
          ...state,
          openFiles: [...state.openFiles, stored],
          activeFilePath: canon,
        };
      });
    },
    closeFile: (path: string) => {
      const canon = normalizeFilePath(path);
      update((state) => {
        const openFiles = state.openFiles.filter((f) => normalizeFilePath(f.path) !== canon);
        let activeFilePath = state.activeFilePath;
        if (activeFilePath != null && normalizeFilePath(activeFilePath) === canon) {
          activeFilePath = openFiles.length > 0 ? normalizeFilePath(openFiles[openFiles.length - 1].path) : null;
        }
        return { ...state, openFiles, activeFilePath };
      });
    },
    setActiveFile: (path: string) => {
      const canon = normalizeFilePath(path);
      update((state) => ({ ...state, activeFilePath: canon }));
    },
    updateFileContent: (path: string, content: string) => {
      const canon = normalizeFilePath(path);
      update((state) => ({
        ...state,
        openFiles: state.openFiles.map((f) =>
          normalizeFilePath(f.path) === canon ? { ...f, content, isDirty: true } : f
        ),
      }));
    },
    markSaved: (path: string) => {
      const canon = normalizeFilePath(path);
      update((state) => ({
        ...state,
        openFiles: state.openFiles.map((f) =>
          normalizeFilePath(f.path) === canon
            ? { ...f, isDirty: false, pendingOnDisk: false }
            : f
        ),
      }));
    },
    renameOpenFilePath(oldPath: string, newPath: string, newName: string) {
      const canonOld = normalizeFilePath(oldPath);
      const canonNew = normalizeFilePath(newPath);
      update((state) => {
        const openFiles = state.openFiles.map((f) =>
          normalizeFilePath(f.path) === canonOld
            ? { ...f, path: canonNew, name: newName }
            : f
        );
        let activeFilePath = state.activeFilePath;
        if (activeFilePath != null && normalizeFilePath(activeFilePath) === canonOld) {
          activeFilePath = canonNew;
        }
        return { ...state, openFiles, activeFilePath };
      });
    },
    clearOpenFiles() {
      update((state) => ({ ...state, openFiles: [], activeFilePath: null }));
    },
    /** Test-only reset (workbench unit tests). */
    resetForTests() {
      set({
        tree: [],
        openFiles: [],
        activeFilePath: null,
        workspacePath: null,
      });
    },
    collapseAll() {
      const collapse = (entries: FileEntry[]): FileEntry[] =>
        entries.map((entry) => ({
          ...entry,
          expanded: false,
          children: entry.children ? collapse(entry.children) : undefined,
        }));
      update((state) => ({ ...state, tree: collapse(state.tree) }));
    },
    /** Collapse nested folders; keep the workspace root row expanded. */
    collapseAllSubfolders(workspacePath: string) {
      const ws = normalizeFilePath(workspacePath);
      const collapse = (entries: FileEntry[]): FileEntry[] =>
        entries.map((entry) => {
          const isRoot = normalizeFilePath(entry.path) === ws;
          if (isRoot) {
            return {
              ...entry,
              expanded: true,
              children: entry.children ? collapse(entry.children) : entry.children,
            };
          }
          return {
            ...entry,
            expanded: false,
            children: entry.children ? collapse(entry.children) : undefined,
          };
        });
      update((state) => ({ ...state, tree: collapse(state.tree) }));
    },
  };
}

export const files = createFilesStore();

export const activeFile = derived(files, ($files) => {
  const ap = $files.activeFilePath;
  if (ap == null) return null;
  const key = normalizeFilePath(ap);
  return $files.openFiles.find((f) => normalizeFilePath(f.path) === key) ?? null;
});
