/**
 * Selects which skills inject into the system prompt for a given mode, and
 * interpolates their variables (spec 30 §5, §10).
 */
import type { ChatMode } from "../stores/mode";
import type { SkillsState } from "../stores/skills";
import { BUNDLED_SKILLS } from "./bundled";
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
  options?: { includeBundled?: boolean },
): SkillBlock[] {
  const blocks: SkillBlock[] = [];
  const projectIds = new Set(state.entries.map((e) => e.id));
  const includeBundled = options?.includeBundled !== false;

  if (includeBundled) {
    for (const bundled of BUNDLED_SKILLS) {
      if (projectIds.has(bundled.id)) continue;
      if (!bundled.modes.includes(mode)) continue;
      const text = interpolateSkill(bundled.content, ctx).trim();
      if (!text) continue;
      blocks.push({ id: bundled.id, label: bundled.title, text });
    }
  }

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
