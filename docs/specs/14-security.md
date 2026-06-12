# Security and Secrets

> **Status:** 🔶 **PARTIAL** — Production hardening shipped (v0.1.2): OS keychain, Rust path enforcement, restrictive CSP. Remaining: LLM HTTP in Rust (deferred), preview iframe `sandbox` (intentionally omitted on Linux/WebKitGTK).

See also: [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) · [33-rust-path-enforcement.md](33-rust-path-enforcement.md)

---

## Current State

| Topic | Current Implementation | Status |
|-------|------------------------|--------|
| API keys | OS keychain (`keyring`) — `localStorage` cleared after migration | ✅ Complete — [40](40-product-hardening-and-agent-ux.md) §3 |
| LLM HTTP | Webview `fetch` (keys retrieved from Rust per-request) | ✅ Working |
| CSP | Strict allowlist in `tauri.conf.json` (Anthropic, DeepSeek, localhost) | ✅ Complete |
| Path sandbox | TS layer (`pathUtils.ts`) + Rust `canonicalize_workspace_path` | ✅ Complete — [33](33-rust-path-enforcement.md) |
| Chat XSS | Plain text messages (no markdown HTML) | ✅ Safe |

---

## API Key Storage

### Current (shipped v0.1.2)

- Anthropic and DeepSeek API keys stored in the **OS keychain** via Tauri keyring plugin
- `localStorage` (`sidebar.settings.v4`) holds only non-secret settings; legacy keys migrated and cleared on upgrade
- Settings UI shows "Stored in system keychain" hint; password-style fields

### Deferred

- Moving LLM HTTP entirely to Rust so keys never enter JavaScript memory during requests ([40](40-product-hardening-and-agent-ux.md) §3 follow-on)

---

## LLM HTTP Calls

### Current

- Direct `fetch()` from webview to provider APIs
- API keys retrieved from Rust keychain per-request (not persisted in `localStorage`)
- Keys may still appear in devtools network headers during active requests

### Deferred

- LLM calls in Rust via `reqwest` with stream events — keys never enter JS ([40](40-product-hardening-and-agent-ux.md) Phase C follow-on)

---

## Path Sandboxing

### Current (defense in depth)

**TypeScript** (`src/lib/tools/pathUtils.ts`):
- Blocks `..` traversal attempts
- Rejects absolute paths outside workspace
- Treats `/file.txt` as workspace-relative

**Rust** ([33-rust-path-enforcement.md](33-rust-path-enforcement.md)):
- `canonicalize_workspace_path()` resolves symlinks and rejects paths outside workspace root
- All filesystem IPC commands accept optional `workspace_root` and enforce bounds in Rust

---

## Content Security Policy

### Current (shipped v0.1.2)

`tauri.conf.json` uses a restrictive CSP with explicit allowlists for:
- Provider APIs (Anthropic, DeepSeek)
- Local inference endpoints (`localhost`, `127.0.0.1`)
- `frame-src` for preview iframes on local dev ports

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
| Rust workspace path enforcement | Phase B | ✅ Complete — [33](33-rust-path-enforcement.md) |
| OS keychain | Phase C | ✅ Complete — [40](40-product-hardening-and-agent-ux.md) §3 |
| Production CSP | Phase C | ✅ Complete |
| LLM calls in Rust | Phase C | ❌ Deferred |
| Preview iframe `sandbox` | Phase B | ❌ Intentionally omitted — WebKitGTK renders sandboxed cross-port iframes blank ([44](44-editor-actions-browser-tab.md) §4.1) |
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

### A. OS Keychain for API Keys — ✅ Complete (v0.1.2)

Implemented via Tauri keyring plugin. Keys migrated from `localStorage` on upgrade. See [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) §3.

### B. Preview Iframe Sandbox — ❌ Intentionally omitted

Preview URLs are gated to `localhost` / `127.0.0.1` (`previewUrl.ts`). Explicit `sandbox` attributes were evaluated but **not applied** — WebKitGTK (Tauri/Linux) renders sandboxed cross-port iframes blank. Documented in [44-editor-actions-browser-tab.md](44-editor-actions-browser-tab.md) §4.1.

### Addenda Roadmap

| Item | Priority | Status |
|------|----------|--------|
| OS keychain + migration | Phase C | ✅ Complete |
| Preview iframe `sandbox` attributes | Phase B | ❌ Omitted (WebKitGTK limitation) |
| LLM HTTP in Rust | Phase C | ❌ Deferred |
