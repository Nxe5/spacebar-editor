/** Injected into the model system prompt so tools and paths resolve to the open project. */
export function buildWorkspaceContextBlock(workspacePath: string | null | undefined): string {
  const root = workspacePath?.trim();
  if (!root || root === "/") {
    return "\n\n--- Workspace ---\nNo project folder is open. Ask the user to open a workspace folder (folder icon on the right activity bar) before reading or writing files.";
  }
  return `\n\n--- Workspace ---\nProject root (cwd for tools): ${root}\nUse relative paths from this root (e.g. \`src/main.ts\`), not absolute paths unless necessary.\nWhen scaffolding a new app or site, create files directly in this root — do not run \`create-vite\`, \`create-react-app\`, or similar CLIs that make a new sibling folder. Use write_file, create_file, and run_shell in the open workspace instead.`;
}
