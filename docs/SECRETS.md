# Secrets and local credentials

This project follows a simple hygiene pattern: **no secrets committed to git**, **developer-facing examples only**, and **runtime secrets entered by the user** or injected via environment in CI—not baked into the web bundle.

## Do not commit

- Private keys, PEM files, or cloud IAM JSON beyond `.example` stubs  
- Per-machine `.env` files containing API keys (prefer ignoring `.env` in your global git excludes if you use one locally)  
- Screenshots or logs containing Anthropic (`sk-ant-…`), OAuth tokens, or session cookies  

## Where Tiny Llama stores credentials today

- **Anthropic / OpenAI-style keys** — persisted via the Svelte `settings` store to **`localStorage`** under `tinyllama.settings.v1` when running in the app shell (Tauri webview). This keeps keys out of the repo but is **not** OS-level secret storage; treat the profile directory accordingly on shared machines.  
- **Harness sidecar** — runs as Node alongside Tauri; it reads whatever keys the UI/router sends over IPC for providers you configure in Settings. Do not log raw prompts or keys from `sidecar/`.

## Environment examples

See [.env.example](/.env.example) at the repo root for optional development variables (e.g. dev server port). **Do not** put production API keys in `.env` consumed by Vite unless you fully understand bundling (`import.meta.env`) exposure.

## Rotation

If a key was pasted into Settings during testing and the machine is shared or compromised: revoke/regenerate it at the provider, clear site data for the app webview, or remove `tinyllama.settings.v1` from local storage after uninstalling.
