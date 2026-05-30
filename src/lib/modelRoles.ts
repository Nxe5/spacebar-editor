/** Per-role model overrides (persisted). Compaction refs use `provider:modelId`. */

export type ModelRoleOverrides = {
  chat: string | null;
  compaction: string | null;
  autocomplete: string | null;
};

export const DEFAULT_MODEL_ROLES: ModelRoleOverrides = {
  chat: null,
  compaction: null,
  autocomplete: null,
};

export function normalizeModelRoles(raw: Partial<ModelRoleOverrides> | undefined): ModelRoleOverrides {
  const base = raw ?? {};
  const pick = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    chat: pick(base.chat),
    compaction: pick(base.compaction),
    autocomplete: pick(base.autocomplete),
  };
}
