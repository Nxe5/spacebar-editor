<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { settings, type ChatBackend } from "$lib/stores/settings";
  import { applyWorkbenchTheme, type WorkbenchThemeId } from "$lib/workbench-theme";
  import { markOnboardingComplete } from "$lib/onboarding";
  import { pickWorkspaceFolder, getRecentProjects, isTauriAvailable } from "$lib/ipc";
  import { applyWorkspaceFolder } from "$lib/workspace";
  import { normalizeFilePath } from "$lib/fsPath";

  interface Props {
    onDone: () => void;
  }

  let { onDone }: Props = $props();

  const desktop = isTauriAvailable();

  type Step = 1 | 2 | 3;
  let step = $state<Step>(1);

  /* ── Step 1: theme ─────────────────────────────────────────── */
  /** Swatch colors sampled from each preset's palette (--background plus three signature accents). */
  const THEME_CHOICES: { id: WorkbenchThemeId; label: string; blurb: string; bg: string; colors: string[] }[] = [
    { id: "dark-dracula", label: "Dark Dracula", blurb: "Saturated Dracula palette, translucent panels", bg: "#20222c", colors: ["#ff79c6", "#bd93f9", "#8be9fd"] },
    { id: "spacebar", label: "Spacebar", blurb: "The default — clean, neutral dark", bg: "#1e1e1e", colors: ["#007acc", "#4ec9b0", "#ce9178"] },
    { id: "dark-bubblegum", label: "Dark Bubblegum", blurb: "Dark with playful accents", bg: "#181818", colors: ["#88c0d0", "#ff4d6d", "#a6ffcb"] },
  ];

  /** Spacebar is the default selection (centered in the grid). */
  let selectedTheme = $state<WorkbenchThemeId>("spacebar");

  function chooseTheme(id: WorkbenchThemeId) {
    selectedTheme = id;
    settings.setWorkbenchTheme(id);
    applyWorkbenchTheme(id);
  }

  /* ── Step 2: provider ──────────────────────────────────────── */
  type ProviderChoice = {
    id: ChatBackend;
    label: string;
    kind: "key" | "endpoint";
    placeholder: string;
  };

  const PROVIDER_CHOICES: ProviderChoice[] = [
    { id: "anthropic", label: "Anthropic (Claude)", kind: "key", placeholder: "sk-ant-…" },
    { id: "deepseek", label: "DeepSeek", kind: "key", placeholder: "sk-…" },
    { id: "glm", label: "GLM (Z.AI)", kind: "key", placeholder: "API key" },
    { id: "kimi", label: "Kimi (Moonshot)", kind: "key", placeholder: "API key" },
    { id: "ollama", label: "Ollama (local)", kind: "endpoint", placeholder: "http://127.0.0.1:11434" },
    { id: "llamacpp", label: "llama.cpp (local)", kind: "endpoint", placeholder: "http://127.0.0.1:8080" },
  ];

  let selectedProvider = $state<ChatBackend>("ollama");
  let apiKeyInput = $state("");
  let endpointInput = $state("http://127.0.0.1:11434");

  let providerChoice = $derived(
    PROVIDER_CHOICES.find((p) => p.id === selectedProvider) ?? PROVIDER_CHOICES[4]
  );

  function chooseProvider(p: ProviderChoice) {
    selectedProvider = p.id;
    apiKeyInput = "";
    endpointInput =
      p.id === "ollama" ? "http://127.0.0.1:11434" : p.id === "llamacpp" ? "http://127.0.0.1:8080" : "";
  }

  function applyProvider() {
    if (providerChoice.kind === "key") {
      const key = apiKeyInput.trim();
      if (key) {
        // setApiKey also switches the chat backend when a key is first added.
        settings.setApiKey(selectedProvider as "anthropic" | "deepseek" | "glm" | "kimi", key);
      }
      settings.setChatBackend(selectedProvider);
    } else {
      const endpoint = endpointInput.trim();
      if (endpoint) {
        if (selectedProvider === "ollama") settings.setOllamaEndpoint(endpoint);
        else settings.setLlamacppEndpoint(endpoint);
      }
      settings.setChatBackend(selectedProvider);
    }
    // Persist completion now — the theme + provider setup should never repeat, even if the
    // user quits at the (optional) project step or opening a folder fails.
    markOnboardingComplete();
    step = 3;
  }

  /* ── Step 3: project ───────────────────────────────────────── */
  let recentProjects = $state<string[]>([]);
  let opening = $state(false);

  onMount(async () => {
    // Apply the default (Spacebar) so the app previews the selection even if the user never taps a swatch.
    chooseTheme(selectedTheme);
    if (desktop) {
      recentProjects = await getRecentProjects().catch(() => []);
    }
  });

  function folderName(path: string): string {
    const parts = normalizeFilePath(path).split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
  }

  async function openFolder() {
    if (opening) return;
    opening = true;
    try {
      const path = await pickWorkspaceFolder();
      if (path) {
        await applyWorkspaceFolder(path);
        finish();
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      opening = false;
    }
  }

  async function openRecent(path: string) {
    if (opening) return;
    opening = true;
    try {
      await applyWorkspaceFolder(path);
      finish();
    } catch (e) {
      toast.error(String(e));
    } finally {
      opening = false;
    }
  }

  function finish() {
    markOnboardingComplete();
    onDone();
  }
</script>

<div class="onboarding" role="dialog" aria-modal="true" aria-label="Welcome setup">
  <div class="onboarding-card">
    <header class="onboarding-header">
      <h1 class="onboarding-title">Welcome to Spacebar Editor</h1>
      <p class="onboarding-step-label">
        Step {step} of 3 —
        {step === 1 ? "Pick a theme" : step === 2 ? "Choose your model provider" : "Open a project"}
      </p>
      <div class="onboarding-progress" aria-hidden="true">
        {#each [1, 2, 3] as s (s)}
          <span class="progress-dot" class:progress-dot--active={s <= step}></span>
        {/each}
      </div>
    </header>

    {#if step === 1}
      <div class="theme-grid">
        {#each THEME_CHOICES as t (t.id)}
          <button
            type="button"
            class="theme-choice"
            class:theme-choice--selected={selectedTheme === t.id}
            onclick={() => chooseTheme(t.id)}
          >
            <span class="theme-swatch" style="background: {t.bg};">
              <span class="swatch-squares">
                {#each t.colors as c (c)}
                  <span class="swatch-square" style="background: {c};"></span>
                {/each}
              </span>
            </span>
            <span class="theme-name">{t.label}</span>
            <span class="theme-blurb">{t.blurb}</span>
          </button>
        {/each}
      </div>
      <footer class="onboarding-footer">
        <span class="footer-spacer"></span>
        <button type="button" class="btn primary" onclick={() => (step = 2)}>Continue</button>
      </footer>
    {:else if step === 2}
      <div class="provider-list">
        {#each PROVIDER_CHOICES as p (p.id)}
          <button
            type="button"
            class="provider-choice"
            class:provider-choice--selected={selectedProvider === p.id}
            onclick={() => chooseProvider(p)}
          >
            <span class="provider-name">{p.label}</span>
            <span class="provider-kind">{p.kind === "key" ? "API key" : "Local"}</span>
          </button>
        {/each}
      </div>

      <div class="provider-input">
        {#if providerChoice.kind === "key"}
          <label class="input-label" for="onboarding-api-key">API key</label>
          <input
            id="onboarding-api-key"
            type="password"
            class="text-input"
            bind:value={apiKeyInput}
            placeholder={providerChoice.placeholder}
            autocomplete="off"
          />
          <p class="input-hint">Stored locally. It becomes your active chat provider.</p>
        {:else}
          <label class="input-label" for="onboarding-endpoint">Endpoint (host + port)</label>
          <input
            id="onboarding-endpoint"
            type="text"
            class="text-input"
            bind:value={endpointInput}
            placeholder={providerChoice.placeholder}
            autocomplete="off"
          />
          <p class="input-hint">Point at your local server. You can change this later in Settings.</p>
        {/if}
      </div>

      <footer class="onboarding-footer">
        <button type="button" class="btn" onclick={() => (step = 1)}>Back</button>
        <span class="footer-spacer"></span>
        <button type="button" class="btn primary" onclick={applyProvider}>Continue</button>
      </footer>
    {:else}
      <div class="project-step">
        <button type="button" class="btn primary open-btn" onclick={openFolder} disabled={opening || !desktop}>
          {opening ? "Opening…" : "Open project folder"}
        </button>

        {#if recentProjects.length > 0}
          <h2 class="recents-heading">Recent projects</h2>
          <ul class="recents-list">
            {#each recentProjects as path (path)}
              <li>
                <button
                  type="button"
                  class="recent-item"
                  onclick={() => void openRecent(path)}
                  disabled={opening}
                  title={path}
                >
                  {folderName(path)}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <footer class="onboarding-footer">
        <button type="button" class="btn" onclick={() => (step = 2)}>Back</button>
        <span class="footer-spacer"></span>
        <button type="button" class="btn" onclick={finish}>Skip for now</button>
      </footer>
    {/if}
  </div>
</div>

<style>
  .onboarding {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background);
  }

  .onboarding-card {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: min(560px, calc(100vw - 48px));
    padding: 32px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  }

  .onboarding-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .onboarding-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--foreground);
    letter-spacing: -0.02em;
  }

  .onboarding-step-label {
    margin: 0;
    font-size: 12px;
    color: var(--muted-foreground);
  }

  .onboarding-progress {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .progress-dot {
    width: 24px;
    height: 4px;
    border-radius: 999px;
    background: var(--muted);
  }

  .progress-dot--active {
    background: var(--primary);
  }

  /* Step 1: themes */
  .theme-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .theme-choice {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    cursor: pointer;
    text-align: left;
  }

  .theme-choice--selected {
    border-color: var(--primary);
    outline: 1px solid var(--primary);
  }

  .theme-swatch {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .swatch-squares {
    display: flex;
    gap: 6px;
  }

  .swatch-square {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }

  .theme-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--foreground);
  }

  .theme-blurb {
    font-size: 11px;
    color: var(--muted-foreground);
    line-height: 1.35;
  }

  /* Step 2: providers */
  .provider-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .provider-choice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    cursor: pointer;
    text-align: left;
  }

  .provider-choice--selected {
    border-color: var(--primary);
    outline: 1px solid var(--primary);
  }

  .provider-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--foreground);
  }

  .provider-kind {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .provider-input {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .input-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--foreground);
  }

  .text-input {
    padding: 8px 10px;
    font-size: 13px;
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--input);
    border-radius: 6px;
  }

  .text-input:focus-visible {
    outline: 1px solid var(--ring);
    outline-offset: -1px;
  }

  .input-hint {
    margin: 0;
    font-size: 11px;
    color: var(--muted-foreground);
  }

  /* Step 3: project */
  .project-step {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .open-btn {
    align-self: flex-start;
  }

  .recents-heading {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
  }

  .recents-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }

  .recent-item {
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--foreground);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-item:hover:not(:disabled) {
    background: var(--accent);
  }

  /* Footer */
  .onboarding-footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .footer-spacer {
    flex: 1;
  }

  .btn {
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--secondary);
    color: var(--foreground);
  }

  .btn:hover:not(:disabled) {
    background: var(--muted);
  }

  .btn.primary {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--primary-foreground);
  }

  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
