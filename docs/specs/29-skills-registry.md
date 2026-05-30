# Spec 29 — Skills Registry

> **Status:** ❌ Not started (Phase 3 — Ecosystem)
> **Area:** Skills · Distribution · CLI (future)
> **Phase:** 3 — Ecosystem ([17-roadmap.md](17-roadmap.md))
> **Depends on:** [23-skills-system.md](23-skills-system.md) (skill format must ship and stabilize first)

> **Related:** `extension.md` §3.7 · local-first / hackable positioning ([01-product.md](01-product.md))

---

## 1. Overview

Once the [skills system](23-skills-system.md) ships, a sharing mechanism compounds its value: organizations and the community can publish reusable skills that encode conventions, security policies, and domain knowledge. This spec is intentionally **deferred** — it exists to ensure the skill manifest format ([23](23-skills-system.md) §3) stays forward-compatible, not to be built now.

The registry must preserve the local-first ethos: installing a skill drops files into `.tinyllama/skills/`; nothing about a project leaves the machine unless the user explicitly publishes.

### Goals

- Discover, install, and update skills from a registry without manual file copying.
- Publish skills (org-internal or public) from a workspace.
- Keep the install unit identical to a local skill directory (no special runtime).

### Non-Goals (and explicit deferrals)

- Building the hosted service now — **the only v-now obligation is format stability**.
- Executable/plugin skills (skills remain declarative prompt fragments — [23](23) non-goals).
- Telemetry or phone-home on skill use.
- A package manager dependency graph between skills.

---

## 2. Distribution Models (candidates)

| Model | Pros | Cons |
|-------|------|------|
| **GitHub-based** (skills are repos / a monorepo) | Zero infra; familiar; reviewable via PRs | Discovery weaker; rate limits |
| **Hosted registry** (`registry.tinyllama.dev`) | Search, versioning, curation | Infra + moderation cost; central point |
| **Hybrid** | GitHub source of truth + thin index for search | More moving parts |

Recommendation: start **GitHub-based** in Phase 3; a hosted index is optional later. "Install" = clone/copy a skill directory into `.tinyllama/skills/`.

---

## 3. Conceptual CLI (future)

```bash
tlama skill search rust
tlama skill install rust-embedded         # → .tinyllama/skills/rust-embedded/
tlama skill update                        # refresh installed skills
tlama skill publish my-org-conventions    # push to a configured remote
```

For Phase 3 launch, "install" can be entirely manual (drop a directory in `.tinyllama/skills/`). The CLI is sugar over that.

---

## 4. Format Stability Obligations (apply NOW)

To avoid a breaking migration later, [23-skills-system.md](23-skills-system.md) must ship with:

- A **`version`** field in `skill.json` (semver) — already specified.
- A stable, documented `skill.json` schema (id, title, version, description, modes, priority, autoActivate, variables, content).
- `id` uniqueness and directory-name correspondence.
- No registry-only fields leaking into the local format.

A future registry adds **metadata around** skills (author, downloads, signatures) without changing the on-disk skill format.

---

## 5. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Malicious skill content | Skills are prompt text, not code — but can socially engineer the agent; show diff on install, require explicit enable |
| Supply-chain trust | Prefer signed/verified publishers; show source repo + author |
| Prompt injection via shared skill | Same review surface as any prompt; skills are visible files the user can read |
| Accidental publish of private conventions | Explicit `publish` step; never auto-sync `.tinyllama/skills/` anywhere |

Installing a skill must **never** auto-enable it without the user seeing its content (open `skill.md` for review).

---

## 6. Implementation Plan (deferred)

### Phase 3a — Manual sharing convention

- [ ] Document "drop a directory into `.tinyllama/skills/`" install flow
- [ ] Publish a starter GitHub repo of community skills
- [ ] In-app "Import skill from folder/URL" action (copy + review)

### Phase 3b — CLI (optional)

- [ ] `tlama skill` subcommands (search/install/update/publish)
- [ ] Configurable remote (GitHub org / registry URL)

### Phase 3c — Hosted index (optional)

- [ ] Search index + curation
- [ ] Publisher verification / signing

---

## 7. Open Questions

| Question | Recommendation |
|----------|----------------|
| GitHub vs hosted registry? | GitHub-based first; defer hosted index until demand is proven. |
| Should the registry ever host executable skills? | No — keep skills declarative; executable behavior belongs to a separate plugin spec. |
| Signing/verification in v1 of the registry? | Show source + author first; signing later. |
| Where does the CLI live? | Separate `tlama` binary or a Tauri-bundled subcommand — decide at Phase 3b. |

---

## 8. Acceptance Criteria (when built)

1. A user can install a published skill into `.tinyllama/skills/` and review its content before enabling.
2. Installed skills use the identical on-disk format as local skills ([23](23-skills-system.md)).
3. Publishing requires an explicit action; nothing syncs automatically.
4. The skill manifest format required no breaking migration from its [23](23-skills-system.md) v1 shape.

---

*Spec created: 2026-05-30 · Source: `extension.md` §3.7 · Target: Phase 3 (ecosystem) — format obligations apply immediately*
