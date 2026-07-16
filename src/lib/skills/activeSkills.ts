/**
 * Selects which skills inject into the system prompt for a given mode, and
 * interpolates their variables (spec 30 §5, §10).
 */
import type { ChatMode } from "../stores/mode";
import type { SkillsState } from "../stores/skills";
import { interpolateSkill, type VariableContext } from "./skillVariables";

export interface SkillBlock {
  id: string;
  label: string;
  text: string;
}

/**
 * Returns the interpolated text blocks for all enabled skills whose modes
 * include `mode`. Empty (whitespace-only) blocks are dropped.
 */
export function buildActiveSkillBlocks(
  state: SkillsState,
  mode: ChatMode,
  ctx: VariableContext,
): SkillBlock[] {
  const blocks: SkillBlock[] = [];
  for (const entry of state.entries) {
    if (!entry.enabled) continue;
    if (!entry.modes.includes(mode)) continue;
    const raw = state.contents[entry.id] ?? "";
    const text = interpolateSkill(raw, ctx).trim();
    if (!text) continue;
    blocks.push({ id: entry.id, label: entry.title, text });
  }
  return blocks;
}
