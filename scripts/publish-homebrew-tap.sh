#!/usr/bin/env bash
# Publish homebrew-spacebar/ to GitHub (one-time setup or after cask updates).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAP="$ROOT/homebrew-spacebar"

if [[ ! -d "$TAP/Casks" ]]; then
  echo "Missing $TAP/Casks — run from spacebar-editor repo" >&2
  exit 1
fi

cd "$TAP"

if [[ ! -d .git ]]; then
  git init
  git branch -M main
fi

if ! git remote get-url origin &>/dev/null; then
  echo "Creating GitHub repo Jiguey/homebrew-spacebar ..."
  gh repo create Jiguey/homebrew-spacebar \
    --public \
    --source=. \
    --remote=origin \
    --description "Homebrew tap for Spacebar Editor" \
    --push
  echo "Done. Users can install with:"
  echo "  brew tap Jiguey/spacebar"
  echo "  brew install --cask spacebar-editor"
  exit 0
fi

git add -A
if git diff --cached --quiet; then
  echo "No tap changes to publish."
  exit 0
fi

git commit -m "Update spacebar-editor cask"
git push origin main
echo "Tap published."
