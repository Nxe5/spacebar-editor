import type { ChatMode } from "../../stores/mode";

export interface BundledSkill {
  id: string;
  title: string;
  description: string;
  modes: ChatMode[];
  version: string;
  content: string;
}

/** Shipped skills merged into the system prompt unless a project skill uses the same id. */
export const BUNDLED_SKILLS: BundledSkill[] = [
  {
    id: "typescript",
    title: "TypeScript",
    description: "TypeScript and Node conventions for this editor stack",
    modes: ["plan", "agent"],
    version: "1.0.0",
    content: `# TypeScript

- Prefer strict typing; avoid \`any\` unless bridging untyped APIs.
- Use existing project scripts (\`pnpm test\`, \`pnpm build\`) instead of ad-hoc tooling.
- Match import style and path aliases already used in the repo.
- For Svelte 5, use runes (\`$state\`, \`$derived\`, \`$effect\`) rather than legacy reactive statements when editing Svelte files.`,
  },
  {
    id: "svelte",
    title: "Svelte 5",
    description: "Svelte 5 component and store patterns",
    modes: ["plan", "agent"],
    version: "1.0.0",
    content: `# Svelte 5

- Use \`$props()\` for component inputs and \`$state\` for local mutable state.
- Keep components focused; push shared logic into \`src/lib/\` modules.
- Prefer \`$derived\` over manual synchronization in \`$effect\` when possible.
- Co-locate styles with components; follow existing class naming in the workbench.`,
  },
  {
    id: "git-conventions",
    title: "Git Conventions",
    description: "Safe git workflow while the agent edits files",
    modes: ["plan", "agent"],
    version: "1.0.0",
    content: `# Git Conventions

- Make small, reviewable edits; avoid unrelated drive-by changes.
- Use \`get_git_status\` and \`get_git_diff\` before large refactors.
- Do not commit unless the user explicitly asks.
- Prefer \`str_replace\` for surgical edits; use \`write_file\` for new files or full rewrites.`,
  },
  {
    id: "testing",
    title: "Testing",
    description: "Run and extend Vitest coverage appropriately",
    modes: ["agent"],
    version: "1.0.0",
    content: `# Testing

- Unit tests live under \`tests/unit/\`; run \`pnpm test\` after substantive changes.
- Mock Tauri IPC in unit tests; integration tests are opt-in via env flags.
- Add tests for non-trivial tool, policy, or agent-loop behavior you introduce.`,
  },
];

export function bundledSkillIds(): string[] {
  return BUNDLED_SKILLS.map((s) => s.id);
}
