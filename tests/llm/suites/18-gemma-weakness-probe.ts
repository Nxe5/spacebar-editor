import type { LLMSuite } from "../types";

/** Probes known weak areas for small local models — informs app tuning vs model limits. */
export const suite: LLMSuite = {
  id: "18-gemma-weakness-probe",
  title: "Gemma: Weakness Probes",
  tests: [
    {
      id: "gemma-weak-01",
      suite: "18-gemma-weakness-probe",
      mode: "agent",
      category: "weakness",
      description: "Resist inventing tool output",
      messages: [
        {
          role: "user",
          content:
            "Run grep for 'NONEXISTENT_TOKEN_XYZ' in the workspace. Report ONLY what the tool returns — do not guess.",
        },
      ],
      expectedBehavior: "Calls grep, admits no matches — no fabricated results",
      expectedTools: ["grep"],
      tags: ["gemma", "weakness"],
    },
    {
      id: "gemma-weak-02",
      suite: "18-gemma-weakness-probe",
      mode: "agent",
      category: "weakness",
      description: "Multi-step without skipping read",
      messages: [
        {
          role: "user",
          content:
            "Read sample.ts, then create notes/sample-summary.md with one bullet per exported function. Do not skip reading the file.",
        },
      ],
      expectedBehavior: "read_file before create_file, accurate function list",
      expectedTools: ["read_file", "create_file"],
      tags: ["gemma", "weakness"],
    },
    {
      id: "gemma-weak-03",
      suite: "18-gemma-weakness-probe",
      mode: "chat",
      category: "weakness",
      description: "Reasoning without tools — JSON schema design",
      messages: [
        {
          role: "user",
          content:
            "Design a JSON schema for a paginated list of GitHub issues. Include id, title, state, labels. Output valid JSON Schema only.",
        },
      ],
      expectedBehavior: "Valid JSON Schema structure",
      tags: ["gemma", "weakness"],
    },
    {
      id: "gemma-weak-04",
      suite: "18-gemma-weakness-probe",
      mode: "agent",
      category: "weakness",
      description: "Shell command with bounded output",
      messages: [
        {
          role: "user",
          content: "Use run_shell to run: wc -l sample.ts README.md. Report the line counts.",
        },
      ],
      expectedBehavior: "Calls run_shell, parses wc output",
      expectedTools: ["run_shell"],
      tags: ["gemma", "weakness"],
    },
    {
      id: "gemma-weak-05",
      suite: "18-gemma-weakness-probe",
      mode: "plan",
      category: "weakness",
      description: "Plan mode — read only, no code edits",
      messages: [
        {
          role: "user",
          content:
            "Analyze buggy.ts and write a plan under plans/ listing each bug with severity. Do not modify buggy.ts.",
        },
      ],
      expectedBehavior: "Reads buggy.ts, creates plan file, leaves buggy.ts unchanged",
      expectedTools: ["read_file", "create_file"],
      tags: ["gemma", "weakness"],
    },
    {
      id: "gemma-weak-06",
      suite: "18-gemma-weakness-probe",
      mode: "agent",
      category: "weakness",
      description: "Long context discipline — read specific file not whole tree dump",
      messages: [
        {
          role: "user",
          content:
            "What does validateEmail in src/auth.ts do? Read that file only — do not list the entire tree first.",
        },
      ],
      expectedBehavior: "Direct read_file on src/auth.ts, correct explanation",
      expectedTools: ["read_file"],
      tags: ["gemma", "weakness"],
    },
  ],
};
