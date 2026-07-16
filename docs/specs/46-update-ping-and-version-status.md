# Spec 46 — Update Ping & Version Status Bar Indicator

> **Status:** 📋 **Draft**
> **Area:** Infrastructure · Workbench UI · Settings · Privacy
> **Phase:** v-next — Phase 1 ships without any server; Phase 2 adds the ping endpoint
> **Depends on:** [05-workbench.md](05-workbench.md) · [14-security.md](14-security.md) · [36-first-run-onboarding.md](36-first-run-onboarding.md) · [16-build.md](16-build.md)

> **Related:** `src/modules/workbench/StatusBar.svelte` · `src/modules/workspace/WelcomeScreen.svelte` · `src/lib/feedback.ts` · `src/lib/stores/settings.ts` · `src-tauri/tauri.conf.json`

---

## 1. Overview

Today the only update surface is the welcome screen: `WelcomeScreen.svelte` calls `getVersion()` and compares against the latest GitHub release. Once a workspace is open the user never sees their version or learns that an update exists. There is also no way for the project to know how many installs are active or which versions they run — release decisions (when to drop a migration path, whether a regression shipped widely) are made blind.

This spec adds three things:

1. **A version indicator at the right end of the status bar** — always visible, with a yellow dot and an **Update** button when the running version is behind the latest release.
2. **A shared update-check module** — one implementation feeding both the welcome screen and the status bar, replacing the copy that lives inside `WelcomeScreen.svelte` today.
3. **An anonymous launch ping** to a first-party endpoint that doubles as the update check: the app reports `{ version, os, arch, installId }` and the server replies with the latest version. This gives version-distribution and active-install counts without collecting anything about the user or their code.

### 1.1 Known defects this spec fixes

| Defect | Where | Fix |
|--------|-------|-----|
| Update check blocked by CSP in release builds | `tauri.conf.json` `connect-src` does not include `api.github.com`, so the welcome-screen `fetch()` fails silently → state `"unknown"` | Add the update/ping hosts to `connect-src` (§6) |
| Stale hardcoded version in feedback emails | `src/lib/feedback.ts` exports `APP_VERSION = "0.1.0"`; `FeedbackDialog.svelte` stamps it into mailto bodies | Delete the constant; use the version from the update store (§4.4) |
| Update logic trapped in one component | `checkForUpdates()` + `compareSemver()` are private to `WelcomeScreen.svelte` | Extract to `src/lib/appUpdate.ts` + `updateStatus` store (§4) |

### 1.2 Goals

- Version number always visible at the right end of the status bar in the workbench.
- Yellow dot + **Update** button (to the left of the version) when an update is available.
- One update check per app launch, refreshed every 24 h while running; result shared by welcome screen and status bar.
- Anonymous usage ping (opt-out) that answers: how many active installs, on which versions, on which platforms.
- Zero personal data: no email, no machine name, no workspace paths, no code, no keys, no IP retention beyond standard transient server logs.
- Full disclosure: exact payload documented here and in the README; settings toggle; the "nothing phones home" README claim amended honestly.

### 1.3 Non-Goals

- **In-app auto-update** (`tauri-plugin-updater`, signed artifacts, updater manifest in CI) — Phase 3, sketched in §9 but not specced.
- Feature-level telemetry, crash reporting, session analytics — explicitly out of scope; the ping is a launch counter, nothing more.
- Prompting or nagging: no modal, no toast on update. The indicator is passive.
- Package-manager awareness (AUR installs update via `pacman`): the Update button always opens the releases page; it does not attempt to self-update.

---

## 2. Privacy Position

The README currently promises *"Nothing phones home."* A launch ping is phoning home, so shipping this silently would burn the product's core differentiator. The stance:

1. **Update check** (Phase 1): default **on**. Fetches release metadata only, sends nothing but a standard HTTP request. This matches user expectations for desktop apps and is already implied by the shipped welcome-screen check. Toggle: **Settings → General → "Check for updates"**.
2. **Usage ping** (Phase 2): default **on**, but **disclosed on first run** — the existing first-run/onboarding surface ([36](36-first-run-onboarding.md)) gains one line: *"Spacebar sends an anonymous launch ping (version, OS, arch, random install ID) to count active installs. Disable in Settings → General."* Toggle: **Settings → General → "Share anonymous usage ping"**.
3. When the usage ping is **off**, the update check falls back to the GitHub releases API — the user still gets update notifications without touching first-party infrastructure.
4. README §privacy is updated to state exactly what is sent, when, and how to turn each part off. The payload schema in §3.2 is the contract; adding **any** field requires a spec revision and a first-run re-disclosure.

`installId` is a random UUID v4 generated once per install and stored in `localStorage` (`sidebar.installId`). It is not derived from hardware, never leaves the app except in the ping, and is regenerated if the user clears app data. This is the Homebrew-analytics model: enough to count distinct installs and version migration, useless for identifying anyone.

---

## 3. Server (Phase 2)

### 3.1 Endpoint

A single Cloudflare Worker (free tier) at `https://ping.spacebar.dev` (final host TBD — must be first-party and stable, since it is baked into the CSP):

- `POST /v1/ping` — accepts the payload below, records one row in Workers Analytics Engine, responds with the latest version.
- `GET /v1/latest` — same response body, no logging. Used when the usage ping is disabled but the user allows first-party update checks (optional; the GitHub fallback covers this too).

The Worker reads the latest version from a KV key updated by the release workflow (`.github/workflows/release.yml` gains a final step: `wrangler kv key put latest <version>`). No GitHub API call in the hot path, no rate-limit exposure.

### 3.2 Request payload (the complete contract)

```json
{
  "version": "0.1.10",
  "os": "macos",          // "macos" | "linux" | "windows"
  "arch": "aarch64",      // "aarch64" | "x86_64"
  "installId": "5f3c9a4e-..."  // random UUID v4, per-install
}
```

Nothing else. No locale, no screen size, no feature flags, no timestamps beyond server receipt time.

### 3.3 Response

```json
{ "latestVersion": "0.1.11" }
```

### 3.4 Retention & aggregation

- Analytics Engine rows: `(date, version, os, arch, installId)` — used only for `COUNT(DISTINCT installId)` per day/version/platform.
- No IP addresses stored (Analytics Engine does not persist them; Worker logging disabled).
- Dashboard: a simple Worker route or Grafana over the SQL API — out of band, not part of the app.

---

## 4. Client

### 4.1 `src/lib/appUpdate.ts` (new)

Owns everything update/ping related:

```ts
export type UpdateState = "checking" | "up-to-date" | "update-available" | "unknown";

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;   // from @tauri-apps/api/app getVersion()
  latestVersion: string | null;
  releaseUrl: string;       // GitHub releases page (tag URL when known)
  checkedAt: number | null;
}

export function compareSemver(a: string, b: string): number;  // moved from WelcomeScreen
export async function checkForUpdates(): Promise<void>;        // ping or GitHub fallback → store
export function startUpdateChecks(): void;                     // on-launch check + 24h re-check timer
export function getOrCreateInstallId(): string;                // localStorage "sidebar.installId"
```

Behavior of `checkForUpdates()`:

1. `getVersion()` → `currentVersion`. Not in Tauri (`dev:web`) → state `"unknown"`, stop.
2. If usage ping enabled (Phase 2): `POST https://ping.spacebar.dev/v1/ping` with the §3.2 payload (5 s abort timeout, same pattern as the current welcome-screen check).
3. Else, or on ping failure: `GET https://api.github.com/repos/Jiguey/spacebar-editor/releases/latest` (the existing check, now CSP-permitted).
4. If update-check setting is off entirely: state `"unknown"`, no network at all; the status bar shows the bare version.
5. Compare, publish to the store. Network errors → `"unknown"` (never surface an error for this).

At most one launch ping per app process; the 24 h re-check refreshes `latestVersion` but re-pings too (a "daily active" signal, still just the same 4 fields).

### 4.2 `src/lib/stores/updateStatus.ts` (new)

A plain writable store holding `UpdateStatus`, written only by `appUpdate.ts`. Initialized `{ state: "checking", ... }` in Tauri, `"unknown"` otherwise. `startUpdateChecks()` is called once from app bootstrap (`App.svelte` / `main.ts`), **not** from individual components.

### 4.3 `WelcomeScreen.svelte` (refactor)

Delete the local `checkForUpdates`, `compareSemver`, `updateState`, `appVersion`, `latestVersion`; subscribe to `updateStatus` instead. The existing version-bar markup (green/amber/grey dot + update button) stays as is, driven by the store.

### 4.4 `feedback.ts` / `FeedbackDialog.svelte` (fix)

Remove `APP_VERSION`. `FeedbackDialog` reads `currentVersion` from the `updateStatus` store (already populated by launch time; falls back to `""` → the mailto footer is omitted, which `buildFeedbackMailto` already handles).

### 4.5 Settings (`src/lib/stores/settings.ts`)

Two new fields in `sidebar.settings.v4` (additive, no migration bump needed if the settings loader already defaults missing keys — follow the existing pattern for new fields):

```ts
updates: {
  checkForUpdates: boolean;   // default true
  usagePing: boolean;         // default true (Phase 2; ignored in Phase 1)
}
```

Rendered in **Settings → General** under a new "Updates & privacy" group, with the ping toggle's description spelling out the §3.2 payload verbatim.

---

## 5. Status Bar UI

`StatusBar.svelte`, at the far right of `.status-bar__right`, after the workspace/settings group:

```
[toggles] │ [git] [backend status] ........ [editor] │ [panels] │ [ws] [mail] [⚙] │ [Update] ● v0.1.10
                                                                                       ↑         ↑
                                                                        only when behind      always
```

- **Version label** — always rendered (desktop only; hidden when `getVersion()` unavailable): `v{currentVersion}`, styled like `.status-detail` (muted, 10 px). Tooltip: `"Spacebar Editor v0.1.10 — up to date"` / `"…checking for updates"` / `"…v0.1.11 available"`.
- **Yellow dot** — rendered between button and label only when `state === "update-available"`; reuses the existing `.status-dot.yellow` treatment (`#d29922` + glow).
- **Update button** — rendered to the left of the dot only when `state === "update-available"`. Text button (`Update`), amber accent border matching the welcome screen's `.update-btn`, tooltip `"v0.1.11 available — open release page"`. Click → `openExternalUrl(releaseUrl)`.
- No layout shift risk: the right group is `flex-shrink: 0`; the version label adds ~44 px and the button appears only in the update state. A `status-sep` separates the group from the settings icons.
- States `"checking"`, `"up-to-date"`, `"unknown"` all render the bare version label — no dot, no button, no spinner. The status bar stays calm.

The welcome screen keeps its richer version bar (green "up to date" dot etc.); the status bar deliberately shows nothing unless action is possible.

---

## 6. CSP & Config Changes

`src-tauri/tauri.conf.json` → `app.security.csp.connect-src` gains:

```
https://ping.spacebar.dev https://api.github.com
```

`api.github.com` is required for Phase 1 (and remains as the Phase 2 fallback). This is also the standing fix for the currently-broken welcome-screen check.

No new Tauri capabilities or Rust commands are needed — the ping is a plain webview `fetch()`, consistent with the "LLM HTTP via webview fetch" architecture rule.

---

## 7. Testing

| Test | File | What it covers |
|------|------|----------------|
| `compareSemver` edge cases | `tests/unit/appUpdate.test.ts` | equal, patch/minor/major diffs, `v` prefixes, malformed segments → 0 |
| Ping payload shape | same | payload contains **exactly** `version/os/arch/installId` — a snapshot test that fails if a field is ever added (enforces §2.4) |
| `installId` stability | same | generated once, persisted, valid UUID v4 |
| Store transitions | same | checking → update-available / up-to-date / unknown; fallback path when ping fetch rejects |
| Settings gating | same | `checkForUpdates: false` → no fetch calls at all; `usagePing: false` → GitHub URL only |
| StatusBar rendering | `tests/unit/statusBar.test.ts` (or component test if the harness supports it) | version label always present in Tauri; button + dot only in `update-available` |

Manual verification: release build (CSP active) must show the correct state on both welcome screen and status bar — this is the case the old implementation silently failed.

---

## 8. Implementation Phases

| Phase | Scope | Server needed |
|-------|-------|---------------|
| **1** | `appUpdate.ts` + store, WelcomeScreen refactor, status bar indicator + button, `feedback.ts` fix, CSP fix, `checkForUpdates` setting. Update check via GitHub releases API only. | No |
| **2** | Cloudflare Worker (`/v1/ping`), release-workflow KV step, `usagePing` setting + first-run disclosure line, README privacy section update, payload snapshot test. | Yes |
| **3** *(future, unspecced)* | `tauri-plugin-updater`: signed artifacts, `latest.json` manifest in CI, in-app download+install flow, disabled for AUR/package-manager builds. | Yes |

Phase 1 is self-contained and immediately fixes two shipped defects; Phase 2 can follow whenever the domain/Worker exists.

---

## 9. Open Questions

1. **Final ping hostname** — needs a first-party domain the project controls long-term (it is hardcoded in the CSP of every shipped binary; a dead domain means silent fallback to GitHub forever for those versions).
2. **Opt-in vs opt-out for the ping** — this spec says opt-out + first-run disclosure (§2). If the project wants the README's "nothing phones home" line to stay literally true, flip to opt-in and accept significant undercounting.
3. **Version source of truth** — `package.json`, `tauri.conf.json`, and (until this spec) `feedback.ts` each carry a version. `scripts/release.mjs` should be the only writer of all of them; worth an audit while touching this area.
