<script lang="ts">
  interface Props {
    output: string;
  }

  let { output }: Props = $props();
</script>

<div class="agent-terminal-output" aria-readonly="true">
  <pre>{output}</pre>
</div>

<style>
  .agent-terminal-output {
    height: 100%;
    overflow: auto;
    background: var(--editor-bg, #1e1e1e);
    color: var(--editor-fg, #d4d4d4);
    padding: 8px 10px;
    box-sizing: border-box;
  }

  .agent-terminal-output pre {
    margin: 0;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
    cursor: text;
  }
</style>
