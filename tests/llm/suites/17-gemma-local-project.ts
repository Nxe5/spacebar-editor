import type { LLMSuite } from "../types";

/** Simulates local multi-file project work — the primary use case for Spacebar Editor + Gemma. */
export const suite: LLMSuite = {
  id: "17-gemma-local-project",
  title: "Gemma: Local Project Work",
  tests: [
    {
      id: "gemma-project-01",
      suite: "17-gemma-local-project",
      mode: "agent",
      category: "local-project",
      smoke: true,
      description: "Map codebase structure",
      messages: [
        {
          role: "user",
          content:
            "I'm new to this project. Use get_file_tree and read key files under src/ to explain the architecture in 3–5 sentences.",
        },
      ],
      expectedBehavior: "Tree + reads src files, mentions auth/routes/validate",
      expectedTools: ["get_file_tree", "read_file"],
      tags: ["gemma", "local-project", "gemma-smoke"],
    },
    {
      id: "gemma-project-02",
      suite: "17-gemma-local-project",
      mode: "agent",
      category: "local-project",
      description: "Add email validation helper",
      messages: [
        {
          role: "user",
          content:
            "Add a function normalizeEmail(email: string): string in src/utils/validate.ts that lowercases and trims. Export it.",
        },
      ],
      expectedBehavior: "Reads validate.ts, writes updated file with new export",
      expectedTools: ["read_file", "write_file"],
      tags: ["gemma", "local-project"],
    },
    {
      id: "gemma-project-03",
      suite: "17-gemma-local-project",
      mode: "agent",
      category: "local-project",
      description: "Wire new route using existing patterns",
      messages: [
        {
          role: "user",
          content:
            "Add a /admin route to src/api/routes.ts that returns 'admin_only' when user.role is admin, else 'forbidden'. Follow the existing routes pattern.",
        },
      ],
      expectedBehavior: "Reads routes.ts, adds route consistent with style",
      expectedTools: ["read_file", "write_file"],
      tags: ["gemma", "local-project"],
    },
    {
      id: "gemma-project-04",
      suite: "17-gemma-local-project",
      mode: "agent",
      category: "local-project",
      description: "Cross-file grep for User type usage",
      messages: [
        {
          role: "user",
          content:
            "Find every file that references the User type. Grep for 'User' and list files with a one-line summary each.",
        },
      ],
      expectedBehavior: "grep across workspace, accurate file list",
      expectedTools: ["grep"],
      tags: ["gemma", "local-project"],
    },
    {
      id: "gemma-project-05",
      suite: "17-gemma-local-project",
      mode: "agent",
      category: "local-project",
      description: "Fix buggy.ts off-by-one only",
      messages: [
        {
          role: "user",
          content:
            "Read buggy.ts. Fix ONLY the off-by-one bug in sumArray. Do not change anything else.",
        },
      ],
      expectedBehavior: "Targeted fix to loop bound",
      expectedTools: ["read_file", "write_file"],
      tags: ["gemma", "local-project"],
    },
    {
      id: "gemma-project-06",
      suite: "17-gemma-local-project",
      mode: "plan",
      category: "local-project",
      description: "Create implementation plan (plan mode discipline)",
      messages: [
        {
          role: "user",
          content:
            "Read src/auth.ts and src/api/routes.ts. Create plans/2026-auth-hardening.md with tasks to add role checks on all routes.",
        },
      ],
      expectedBehavior: "Reads code, creates plan markdown under plans/",
      expectedTools: ["read_file", "create_file"],
      tags: ["gemma", "local-project"],
    },
  ],
};
