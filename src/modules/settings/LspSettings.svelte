<script lang="ts">
  import { lspServers, setLspServer } from "$lib/lsp/lspSettings";
  import { lspServerStatus, lspServerErrors } from "$lib/lsp/lspStore";
  import { LSP_BINARY_NAMES } from "$lib/lsp/lspProtocol";
  import { isTauriAvailable } from "$lib/ipc";

  const DISPLAY_LANGS: { language: string; label: string; args: string[] }[] = [
    { language: "typescript", label: "TypeScript / JavaScript", args: ["--stdio"] },
    { language: "rust",       label: "Rust (rust-analyzer)",    args: [] },
    { language: "python",     label: "Python (pyright)",        args: ["--stdio"] },
    { language: "go",         label: "Go (gopls)",              args: [] },
    { language: "css",        label: "CSS / SCSS",              args: ["--stdio"] },
    { language: "html",       label: "HTML",                    args: ["--stdio"] },
  ];

  function configFor(lang: string) {
    return $lspServers.find((s) => s.language === lang) ?? {
      language: lang,
      enabled: false,
      command: null,
      args: LSP_BINARY_NAMES[lang] ? [LSP_BINARY_NAMES[lang]] : [],
    };
  }

  function statusFor(lang: string, enabled: boolean): string {
    if (!isTauriAvailable()) return "desktop only";
    const s = $lspServerStatus.get(lang);
    if (s === "starting") return "starting…";
    if (s === "running") return "running";
    if (s === "error") return "failed to start";
    if (enabled) return "enabled — open a file to start";
    return "off";
  }

  function statusClass(lang: string, enabled: boolean): string {
    const s = $lspServerStatus.get(lang);
    if (s === "running") return "status-dot status-dot--green";
    if (s === "error") return "status-dot status-dot--red";
    if (s === "starting") return "status-dot status-dot--yellow";
    if (enabled && isTauriAvailable()) return "status-dot status-dot--blue";
    return "";
  }
</script>

<div class="stack">
  <h3 class="title">LSP — Language Server Protocol</h3>
  <p class="note">
    Language servers provide inline diagnostics, hover docs, and completions.
    Install the server binary for each language you want, then enable it here.
    Changes take effect when you next open a file of that type.
  </p>
  <p class="note muted">
    Requires the Sidebar Editor desktop app. Servers are discovered on your
    <code class="inline-code">PATH</code> unless you specify a custom path.
    <strong>Status</strong> shows whether the server process is running — it stays
    <em>enabled — open a file to start</em> until you open a matching file in the editor
    (e.g. a <code class="inline-code">.ts</code> file for TypeScript).
  </p>

  <table class="lsp-table">
    <thead>
      <tr>
        <th>Language</th>
        <th>Server binary</th>
        <th>Custom path</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {#each DISPLAY_LANGS as row (row.language)}
        {@const cfg = configFor(row.language)}
        {@const status = statusFor(row.language, cfg.enabled)}
        <tr>
          <td class="lang-cell">
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={cfg.enabled}
                onchange={(e) =>
                  setLspServer(row.language, {
                    enabled: (e.currentTarget as HTMLInputElement).checked,
                    args: cfg.args.length ? cfg.args : row.args,
                  })}
              />
              <span>{row.label}</span>
            </label>
          </td>
          <td class="binary-cell">
            <code class="inline-code">{LSP_BINARY_NAMES[row.language] ?? "—"}</code>
          </td>
          <td class="path-cell">
            <input
              type="text"
              class="input"
              placeholder="Default (PATH)"
              value={cfg.command ?? ""}
              spellcheck={false}
              oninput={(e) =>
                setLspServer(row.language, {
                  command: (e.currentTarget as HTMLInputElement).value.trim() || null,
                })}
            />
          </td>
          <td class="status-cell">
            {#if status}
              <span class={statusClass(row.language, cfg.enabled)}></span>
              <span class="status-text" class:status-text--error={$lspServerStatus.get(row.language) === "error"}>{status}</span>
            {:else}
              <span class="status-text muted">—</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="hint">
    TypeScript: install with
    <code class="inline-code">npm i -g typescript-language-server typescript</code>
  </p>
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #e8e8e8;
  }

  .note {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #737373;
  }

  .note.muted { color: #5c5c5c; }

  .hint {
    margin: 0;
    font-size: 11px;
    color: #5c5c5c;
  }

  .inline-code {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: #1c1c1c;
    color: #c5c5c5;
  }

  .lsp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .lsp-table th {
    padding: 5px 8px;
    border-bottom: 1px solid #333;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
  }

  .lsp-table td {
    padding: 8px 8px;
    border-bottom: 1px solid #2a2a2a;
    vertical-align: middle;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: #c8c8c8;
  }

  .binary-cell { color: #888; }

  .path-cell { min-width: 120px; }

  .input {
    width: 100%;
    padding: 4px 8px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
    color: #e5e5e5;
    background: #1c1c1c;
    border: 1px solid #404040;
    border-radius: 4px;
    box-sizing: border-box;
  }

  .input:focus {
    outline: none;
    border-color: #525252;
  }

  .status-cell {
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot--green  { background: #3fb950; }
  .status-dot--yellow { background: #d29922; }
  .status-dot--red    { background: #f85149; }
  .status-dot--blue   { background: #58a6ff; }

  .status-text { font-size: 11px; color: #888; }
  .status-text--error { color: #f85149; white-space: normal; max-width: 280px; }
  .status-text.muted { color: #444; }
</style>
