# Security and Secrets

> **Status:** 🔶 **PARTIAL** — Production hardening shipped (v0.1.2): Rust path enforcement, restrictive CSP. **v0.1.5:** cloud API keys moved back to app settings (see §API Key Storage). Remaining: LLM HTTP in Rust (deferred), preview iframe `sandbox` (intentionally omitted on Linux/WebKitGTK).

See also: [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) · [33-rust-path-enforcement.md](33-rust-path-enforcement.md)

---

## Current State

| Topic | Current Implementation | Status |
|-------|------------------------|--------|
| API keys | App settings (`settings.apiKeys` in `sidebar.settings.v4`) | ✅ Complete — v0.1.5 |
| LLM HTTP | Webview `fetch` (keys read from settings store) | ✅ Working |
| CSP | Strict allowlist in `tauri.conf.json` (Anthropic, DeepSeek, GLM, Kimi, localhost) | ✅ Complete |
| Path sandbox | TS layer (`pathUtils.ts`) + Rust `canonicalize_workspace_path` | ✅ Complete — [33](33-rust-path-enforcement.md) |
| Chat XSS | Plain text messages (no markdown HTML) | ✅ Safe |

---

## API Key Storage

### Current (shipped v0.1.5)

- Cloud provider API keys (Anthropic, DeepSeek, GLM, Kimi) stored in **`settings.apiKeys`** and persisted in `localStorage` under `sidebar.settings.v4`
- Saved via `src/lib/apiSecrets.ts` → `settings.setApiKey()` from Settings → Providers
- Password-style fields in Settings UI
- **Dev only:** optional fallbacks from `.env` via `envApiKeys.ts` / Vite `define` (see `.env.example` — `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `GLM_API_KEY`/`ZAI_API_KEY`, `KIMI_API_KEY`/`MOONSHOT_API_KEY`)

**Why not OS keychain?** v0.1.2 briefly stored keys in the OS keychain via Tauri's keyring plugin, but this triggered repeated permission prompts on some platforms. v0.1.5 reverted to app settings for a smoother UX. Legacy Rust keychain commands (`secrets.rs`) remain registered but are unused by the frontend.

**Trade-off:** keys live in the webview's persisted settings and may appear in devtools network headers during active requests. Moving LLM HTTP to Rust (deferred) would reduce JS exposure.

### Historical (v0.1.2 — superseded)

- Anthropic and DeepSeek keys in OS keychain; `localStorage` held only a boolean `cloudApiKeyStored` flag
- See [40-product-hardening-and-agent-ux.md](40-product-hardening-and-agent-ux.md) §3 for the original design

---

## LLM HTTP Calls

### Current

- Direct `fetch()` from webview to provider APIs
- API keys read from `settings.apiKeys` at stream time (`getCloudApiKey()` in `apiSecrets.ts`)
- Keys may appear in devtools network headers during active requests

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

### Current (shipped v0.1.5)

`tauri.conf.json` uses a restrictive CSP with explicit allowlists for:
- Provider APIs: `api.anthropic.com`, `api.deepseek.com`, `api.z.ai`, `api.moonshot.ai`
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
| App-settings API key storage | Phase C | ✅ Complete — v0.1.5 |
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

### A. OS Keychain for API Keys — ❌ Superseded (v0.1.5)

Originally implemented in v0.1.2 via Tauri keyring plugin. Reverted in v0.1.5 — keys now in app settings. See §API Key Storage above.

### B. Preview Iframe Sandbox — ❌ Intentionally omitted

Preview URLs are gated to `localhost` / `127.0.0.1` (`previewUrl.ts`). Explicit `sandbox` attributes were evaluated but **not applied** — WebKitGTK (Tauri/Linux) renders sandboxed cross-port iframes blank. Documented in [44-editor-actions-browser-tab.md](44-editor-actions-browser-tab.md) §4.1.

### Addenda Roadmap

| Item | Priority | Status |
|------|----------|--------|
| App-settings API key storage | Phase C | ✅ Complete (v0.1.5) |
| OS keychain + migration | Phase C | ❌ Superseded — reverted v0.1.5 |
| Preview iframe `sandbox` attributes | Phase B | ❌ Omitted (WebKitGTK limitation) |
| LLM HTTP in Rust | Phase C | ❌ Deferred |
