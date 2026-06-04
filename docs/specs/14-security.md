# Security and Secrets

> **Status:** 🔶 **PARTIAL** — Basic security in place; hardening planned.

See also: `docs/SECRETS.md` (if exists) · Hardening detail in [Enhancement Addenda](#enhancement-addenda-from-extensionmd-9) (keychain, iframe sandbox)

---

## Current State

| Topic | Current Implementation | Status |
|-------|------------------------|--------|
| API keys | `localStorage` `sidebar.settings.v4` | 🔶 **P0** — migrate per [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) §3 |
| LLM HTTP | Webview `fetch` | ✅ Working |
| CSP | `null` in `tauri.conf.json` | 🔶 Permissive |
| Path sandbox | TS tools only (`pathUtils.ts`) | 🔶 Partial |
| Chat XSS | Plain text messages (no markdown HTML) | ✅ Safe |

---

## API Key Storage

### Current

- Stored in `localStorage` under key `sidebar.settings.v3`
- Accessible to any JavaScript in the webview
- Cleared on localStorage clear

### Planned (P0 — [Spec 40](40-product-hardening-and-agent-ux.md) §3)

- OS keychain via Tauri **keyring** (Keychain / libsecret / Credential Manager) or **Stronghold**
- Keys never persisted in `localStorage`; migration on upgrade clears legacy fields
- Secure retrieval for LLM calls (Rust-held or ephemeral handoff — not devtools-visible storage)

---

## LLM HTTP Calls

### Current

- Direct `fetch()` from webview to provider APIs
- API keys included in Authorization headers
- Keys visible in browser dev tools

### Planned

- LLM calls in Rust via `reqwest`
- Stream responses via Tauri events
- Keys remain in Rust memory only

---

## Path Sandboxing

### Current (TypeScript)

`src/lib/tools/pathUtils.ts`:
- Blocks `..` traversal attempts
- Rejects absolute paths outside workspace
- Treats `/file.txt` as workspace-relative

### Current (Rust)

- `read_file` / `write_file` accept any path OS allows
- No workspace enforcement at Rust layer

### Planned

- Canonicalize all paths against workspace root in Rust
- Reject paths outside workspace in `filesystem.rs`

---

## Content Security Policy

### Current

```json
// tauri.conf.json
"csp": null
```

Permissive CSP allows:
- Connections to any origin (provider APIs)
- Inline styles and scripts

### Planned

- Restrictive CSP for release builds
- Explicit allowlist for provider domains
- No inline scripts/styles

---

## Chat Content Safety

### Current

- Messages rendered as plain text
- No HTML parsing or rendering
- Tool outputs escaped

### If Markdown Added

- Use DOMPurify for sanitization
- Whitelist safe tags only
- No raw HTML in messages

---

## Roadmap

| Item | Priority | Status |
|------|----------|--------|
| Rust workspace path enforcement | Phase B | ❌ Not started |
| OS keychain (Stronghold) | Phase C | ❌ Not started |
| LLM calls in Rust | Phase C | ❌ Not started |
| Production CSP | Phase C | ❌ Not started |
| DOMPurify (if markdown) | As needed | ❌ Not started |

---

## Security Considerations

### Model Context

- User messages and file contents sent to LLM providers
- Tool outputs included in context
- No automatic PII filtering

### Shell Execution

- `run_shell` requires `ask` policy by default
- Commands run with user's permissions
- No sandboxing beyond policy gates

### Web Fetch

- Hostname allowlist enforced
- Default hosts: github.com, raw.githubusercontent.com, docs.rs, developer.mozilla.org
- User can add/remove hosts in Settings

---

## Enhancement Addenda (from `extension.md` §9)

> **Status:** ❌ Not started — concrete specs for two items already flagged in the Roadmap table above.

### A. OS Keychain for API Keys (detail for the "Stronghold / keychain" roadmap item)

**Risk:** API keys in `localStorage` are readable by any JavaScript in the webview, including preview-iframe content if the sandbox is insufficient (see B).

**Spec:**

- Integrate `tauri-plugin-keychain` (or the Tauri **Stronghold** plugin).
- On settings save, write each API key to the **OS keychain**; on load, read from the keychain.
- `localStorage` retains only a **`hasStoredKey: boolean`** flag per provider — never the key itself.
- **Migration:** on first launch after update, offer to move existing `localStorage` keys into the keychain, then clear them from `localStorage`.
- **Fallback:** if the keychain is unavailable (some Linux configurations), warn the user and retain current `localStorage` behavior rather than blocking.

**New Rust commands:** `keychain_set(provider, key)`, `keychain_get(provider) -> string | null`, `keychain_delete(provider)`.

**Files to change:** `src/lib/stores/settings.ts`, `src-tauri/` (keychain commands + plugin), `src/modules/settings/SettingsPane.svelte`.

This pairs with the existing **"LLM calls in Rust"** roadmap item: once keys live in the keychain and requests originate in Rust, keys never enter JavaScript at all.

### B. Preview Iframe Sandbox (new)

The preview iframe already restricts URLs to `localhost` / `127.0.0.1` (`previewUrl.ts`) but lacks explicit sandbox attributes.

**Spec:** add explicit sandboxing to the preview iframe in `PreviewPane.svelte`:

```html
<iframe sandbox="allow-scripts allow-same-origin allow-forms" src={previewUrl} />
```

This prevents the previewed page from reaching `window.parent`, app `localStorage`, or Tauri globals — directly mitigating the key-exfiltration vector noted in A.

**Files to change:** `src/modules/preview/PreviewPane.svelte`.

### Addenda Roadmap

| Item | Priority | Status |
|------|----------|--------|
| OS keychain + `hasStoredKey` flag + migration | Phase C | ❌ Not started |
| Preview iframe `sandbox` attributes | Phase B (quick) | ✅ Implemented — `PreviewPane.svelte` drops `allow-popups`, keeps `allow-scripts allow-same-origin allow-forms` (dev-server/HMR needs same-origin), adds `referrerpolicy="no-referrer"` + empty `allow` |
