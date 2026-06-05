#!/usr/bin/env bash
# Small models that work well with Spacebar Editor (the app). Total size roughly 0.5–2.5 GB.
set -euo pipefail
for m in llama3.2:1b qwen2.5:0.5b tinyllama gemma2:2b; do
  echo "=== ollama pull $m ==="
  ollama pull "$m"
done
echo "Done. Run: pnpm test:ollama"
