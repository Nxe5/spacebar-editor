#!/usr/bin/env bash
# Open a file or folder in Spacebar Editor from the terminal.
# Files open in micro-editor mode (all panels collapsed).
# Each invocation starts a new app instance (macOS: open -n).
set -euo pipefail

usage() {
  echo "Usage: spacebar <file-or-directory>" >&2
  echo "       spacebar --dev <file-or-directory>   # use local debug build" >&2
  exit 1
}

DEV_MODE=0
if [[ "${1:-}" == "--dev" ]]; then
  DEV_MODE=1
  shift
fi

[[ $# -ge 1 ]] || usage

resolve_path() {
  local p="$1"
  if [[ ! -e "$p" ]]; then
    echo "Path does not exist: $p" >&2
    exit 1
  fi
  if command -v realpath >/dev/null 2>&1; then
    realpath "$p"
    return
  fi
  if [[ -d "$p" ]]; then
    (cd "$p" && pwd)
  else
    local dir
    dir="$(cd "$(dirname "$p")" && pwd)"
    echo "${dir}/$(basename "$p")"
  fi
}

TARGET="$(resolve_path "$1")"

launch_macos_dev() {
  local script_dir repo app
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo="$(cd "$script_dir/.." && pwd)"
  app="${repo}/src-tauri/target/debug/bundle/macos/Spacebar Editor.app"
  if [[ ! -d "$app" ]]; then
    echo "Debug app not found. Build once with: pnpm tauri build --debug" >&2
    echo "Or run without --dev after installing from a release .dmg." >&2
    exit 1
  fi
  open -n "$app" --args "$TARGET"
}

launch_macos_from_bundle() {
  local script_dir app
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ "$script_dir" == *"/Contents/Resources" ]]; then
    app="$(cd "${script_dir}/../.." && pwd)"
    open -n "$app" --args "$TARGET"
    return 0
  fi
  return 1
}

launch_macos_release() {
  if launch_macos_from_bundle; then
    return 0
  fi

  local app=""
  for candidate in \
    "/Applications/Spacebar Editor.app" \
    "$HOME/Applications/Spacebar Editor.app" \
    /opt/homebrew/Caskroom/spacebar-editor/*/Spacebar\ Editor.app \
    /usr/local/Caskroom/spacebar-editor/*/Spacebar\ Editor.app; do
    if [[ -d "$candidate" ]]; then
      app="$candidate"
      break
    fi
  done
  if [[ -z "$app" ]]; then
    echo "Spacebar Editor.app not found in Applications." >&2
    echo "Install from a release, or use: spacebar --dev <path> after pnpm tauri build --debug" >&2
    exit 1
  fi
  open -n "$app" --args "$TARGET"
}

launch_linux() {
  if command -v spacebar-editor >/dev/null 2>&1; then
    exec spacebar-editor "$TARGET"
  fi
  if [[ -x "/opt/spacebar-editor/AppRun" ]]; then
    exec /opt/spacebar-editor/AppRun "$TARGET"
  fi
  echo "spacebar-editor not found in PATH." >&2
  exit 1
}

case "$(uname -s)" in
  Darwin)
    if [[ "$DEV_MODE" -eq 1 ]]; then
      launch_macos_dev
    else
      launch_macos_release
    fi
    ;;
  Linux)
    launch_linux
    ;;
  *)
    echo "Unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac
