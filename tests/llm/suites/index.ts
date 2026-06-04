import { suite as s01 } from "./01-chat-basic";
import { suite as s02 } from "./02-chat-reasoning";
import { suite as s03 } from "./03-chat-multiturn";
import { suite as s04 } from "./04-chat-code";
import { suite as s05 } from "./05-plan-create";
import { suite as s06 } from "./06-plan-update";
import { suite as s07 } from "./07-plan-multiturn";
import { suite as s08 } from "./08-agent-files";
import { suite as s09 } from "./09-agent-code";
import { suite as s10 } from "./10-agent-fix";
import { suite as s11 } from "./11-agent-multistep";
import { suite as s12 } from "./12-agent-git";
import { suite as s13 } from "./13-agent-search";
import { suite as s14 } from "./14-agent-shell";
import { suite as s15 } from "./15-stress-repetition";
import { suite as s16 } from "./16-gemma-tool-calling";
import { suite as s17 } from "./17-gemma-local-project";
import { suite as s18 } from "./18-gemma-weakness-probe";
import { suite as s19 } from "./19-gemma-project-build";
import type { LLMSuite } from "../types";

export const allSuites: LLMSuite[] = [
  s01,
  s02,
  s03,
  s04,
  s05,
  s06,
  s07,
  s08,
  s09,
  s10,
  s11,
  s12,
  s13,
  s14,
  s15,
  s16,
  s17,
  s18,
  s19,
];

export function findSuite(id: string): LLMSuite | undefined {
  return allSuites.find((s) => s.id === id || s.id.startsWith(id));
}

export function findTest(testId: string): { suite: LLMSuite; test: LLMSuite["tests"][0] } | undefined {
  for (const suite of allSuites) {
    const test = suite.tests.find((t) => t.id === testId);
    if (test) return { suite, test };
  }
  return undefined;
}
