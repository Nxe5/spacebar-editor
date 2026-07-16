import type { Tool } from "../providers/openaiCompat";

export const TOOL_DEFINITIONS: Record<string, Tool> = {
  read_file: {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file at the specified path. Returns the file contents as a string.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or workspace-relative path to the file to read",
          },
          start_line: {
            type: "integer",
            description: "1-indexed first line to read (default 1)",
          },
          max_lines: {
            type: "integer",
            description: "Maximum lines to return (default from agent settings)",
          },
        },
        required: ["path"],
      },
    },
  },

  write_file: {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does. Preferred for multi-line text, markdown, or documents — use real line breaks in content, not \\n escape sequences.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or workspace-relative path to the file to write",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },

  create_file: {
    type: "function",
    function: {
      name: "create_file",
      description:
        "Create a new file with the given content. Fails if the file already exists. Use write_file to overwrite an existing file. Preferred for new multi-line documents (markdown, guides, lists).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or workspace-relative path for the new file",
          },
          content: {
            type: "string",
            description: "The content to write to the new file",
          },
        },
        required: ["path", "content"],
      },
    },
  },

  delete_file: {
    type: "function",
    function: {
      name: "delete_file",
      description:
        "Delete a file or directory at the specified path. Directories are removed recursively.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or workspace-relative path to delete",
          },
        },
        required: ["path"],
      },
    },
  },

  move_file: {
    type: "function",
    function: {
      name: "move_file",
      description:
        "Move or rename a file or directory from one path to another within the workspace.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Source path (absolute or workspace-relative)",
          },
          to: {
            type: "string",
            description: "Destination path (absolute or workspace-relative)",
          },
        },
        required: ["from", "to"],
      },
    },
  },

  list_dir: {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "List the contents of a directory. Returns an array of file and directory entries.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute or workspace-relative path to the directory to list",
          },
        },
        required: ["path"],
      },
    },
  },

  grep: {
    type: "function",
    function: {
      name: "grep",
      description:
        "Search for a pattern in files within the workspace. Uses ripgrep for fast searching. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The regex pattern to search for",
          },
          file_glob: {
            type: "string",
            description:
              "Optional glob pattern to filter files (e.g., '*.ts', '**/*.rs')",
          },
        },
        required: ["pattern"],
      },
    },
  },

  get_git_status: {
    type: "function",
    function: {
      name: "get_git_status",
      description:
        "List changed, staged, and untracked files in the workspace git repository.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },

  get_git_log: {
    type: "function",
    function: {
      name: "get_git_log",
      description: "Show recent commits in the workspace git repository.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of commits to return (default: 32)",
          },
        },
      },
    },
  },

  get_git_diff: {
    type: "function",
    function: {
      name: "get_git_diff",
      description:
        "Show unstaged diff against HEAD for the workspace. Optionally limit to a single file path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Optional file path relative to the repo root. Omit for a repository-wide diff.",
          },
        },
      },
    },
  },

  find_file: {
    type: "function",
    function: {
      name: "find_file",
      description:
        "Find files in the workspace by glob or name substring (e.g. '*.ts', 'package.json').",
      parameters: {
        type: "object",
        properties: {
          glob: {
            type: "string",
            description: "Glob or substring to match file names (e.g. '**/*.rs', 'config')",
          },
          max_results: {
            type: "number",
            description: "Maximum paths to return (default 100)",
          },
        },
        required: ["glob"],
      },
    },
  },

  get_file_tree: {
    type: "function",
    function: {
      name: "get_file_tree",
      description:
        "Return a nested directory tree from a path. Useful for understanding project layout.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path (workspace-relative or absolute)",
          },
          max_depth: {
            type: "number",
            description: "Maximum depth to recurse (default 3)",
          },
        },
        required: ["path"],
      },
    },
  },

  run_tests: {
    type: "function",
    function: {
      name: "run_tests",
      description:
        "Run the project's test suite (pnpm/npm test, cargo test, or pytest based on project files).",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Optional override command (default: auto-detected)",
          },
        },
      },
    },
  },

  run_script: {
    type: "function",
    function: {
      name: "run_script",
      description: "Run a script file in the workspace (shell, node, or python).",
      parameters: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "Path to the script file",
          },
          args: {
            type: "string",
            description: "Optional arguments string",
          },
        },
        required: ["script"],
      },
    },
  },

  web_fetch: {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch text content from an HTTP(S) URL. Only hosts in Settings allowlist are permitted.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "http or https URL to fetch",
          },
        },
        required: ["url"],
      },
    },
  },

  switch_mode: {
    type: "function",
    function: {
      name: "switch_mode",
      description:
        "Request switching between Plan and Agent modes. Plan is read-only analysis; Agent has full write and shell access. Requires user approval before the mode changes.",
      parameters: {
        type: "object",
        properties: {
          target_mode: {
            type: "string",
            enum: ["plan", "agent"],
            description: "The mode to switch to",
          },
          explanation: {
            type: "string",
            description: "Brief reason for requesting the mode switch",
          },
        },
        required: ["target_mode", "explanation"],
      },
    },
  },

  run_shell: {
    type: "function",
    function: {
      name: "run_shell",
      description:
        "Execute a shell command in the workspace directory. Returns stdout, stderr, and exit code. Use for git, builds, and short commands — not for writing multi-line files (use write_file or create_file instead). Avoid echo with \\n; it prints escapes literally.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          timeout_ms: {
            type: "number",
            description: "Optional timeout in milliseconds (default: 30000)",
          },
        },
        required: ["command"],
      },
    },
  },

  lsp_find_references: {
    type: "function",
    function: {
      name: "lsp_find_references",
      description:
        "Find all references to a symbol at a file position using the language server. More accurate than grep — handles renames, overloads, and cross-file type relationships.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Workspace-relative file path" },
          line: { type: "integer", description: "1-based line number" },
          character: { type: "integer", description: "1-based character column" },
          symbol: { type: "string", description: "Optional symbol label for output" },
          include_declaration: {
            type: "boolean",
            description: "Include the declaration site (default false)",
          },
        },
        required: ["file", "line", "character"],
      },
    },
  },

  lsp_go_to_definition: {
    type: "function",
    function: {
      name: "lsp_go_to_definition",
      description: "Resolve the definition location of a symbol at a given file position.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Workspace-relative file path" },
          line: { type: "integer", description: "1-based line number" },
          character: { type: "integer", description: "1-based character column" },
          symbol: { type: "string", description: "Optional symbol label for output" },
        },
        required: ["file", "line", "character"],
      },
    },
  },

  lsp_document_symbols: {
    type: "function",
    function: {
      name: "lsp_document_symbols",
      description:
        "List symbols (functions, classes, methods, variables) in a file without reading full contents.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Workspace-relative file path" },
        },
        required: ["file"],
      },
    },
  },

  lsp_workspace_symbols: {
    type: "function",
    function: {
      name: "lsp_workspace_symbols",
      description: "Search for symbols by name across the workspace.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Symbol name or substring to search" },
        },
        required: ["query"],
      },
    },
  },

  lsp_get_diagnostics: {
    type: "function",
    function: {
      name: "lsp_get_diagnostics",
      description:
        "Get current language server diagnostics (errors and warnings) for a file or the whole workspace.",
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "Optional workspace-relative file path; omit for workspace-wide diagnostics",
          },
        },
      },
    },
  },
};

export const ALL_TOOL_NAMES = Object.keys(TOOL_DEFINITIONS);

/** Meta tools available in Plan and Agent modes (not read-only file ops). */
export const MODE_CONTROL_TOOLS = ["switch_mode"] as const;

export const READ_ONLY_TOOLS = [
  "read_file",
  "list_dir",
  "grep",
  "find_file",
  "get_file_tree",
  "get_git_status",
  "get_git_log",
  "get_git_diff",
  "web_fetch",
  "lsp_find_references",
  "lsp_go_to_definition",
  "lsp_document_symbols",
  "lsp_workspace_symbols",
  "lsp_get_diagnostics",
];

export const WRITE_TOOLS = [
  "write_file",
  "create_file",
  "delete_file",
  "move_file",
  "run_shell",
  "run_tests",
  "run_script",
];

export function getToolsForNames(names: string[]): Tool[] {
  return names
    .filter((name) => name in TOOL_DEFINITIONS)
    .map((name) => TOOL_DEFINITIONS[name]);
}
