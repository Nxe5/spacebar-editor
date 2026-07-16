# Homebrew Cask for Spacebar Editor (macOS universal .dmg).
#
# Canonical tap copy: homebrew-spacebar/Casks/spacebar-editor.rb
#
# After each release:
#   pnpm update-homebrew-cask
#   pnpm sync-homebrew-tap
#
# Install:
#   brew tap Jiguey/spacebar
#   brew install --cask spacebar-editor
#
cask "spacebar-editor" do
  version "0.1.6"
  sha256 "0759fff8526762271fa4d9bb08708c8aefb4d5065ea3b4a124366e2ee8321f94"

  url "https://github.com/Jiguey/spacebar-editor/releases/download/v#{version}/Spacebar.Editor_#{version}_universal.dmg"
  name "Spacebar Editor"
  desc "Local-first AI coding assistant"
  homepage "https://github.com/Jiguey/spacebar-editor"

  depends_on macos: ">= :big_sur"

  app "Spacebar Editor.app"

  postflight do
    app_path = "#{appdir}/Spacebar Editor.app"
    bundled_cli = "#{app_path}/Contents/Resources/spacebar-cli.sh"
    bin = "#{HOMEBREW_PREFIX}/bin/spacebar"

    if File.exist?(bundled_cli)
      FileUtils.cp bundled_cli, bin
    else
      File.write(bin, <<~SHELL)
        #!/bin/bash
        set -euo pipefail
        if [[ $# -lt 1 ]]; then
          echo "Usage: spacebar <file-or-directory>" >&2
          exit 1
        fi
        TARGET="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
        exec open -n "#{app_path}" --args "$TARGET"
      SHELL
    end
    FileUtils.chmod 0o755, bin
  end

  zap trash: [
    "~/Library/Application Support/dev.spacebar.editor",
    "~/Library/Caches/dev.spacebar.editor",
    "~/Library/Preferences/dev.spacebar.editor.plist",
    "~/Library/Saved Application State/dev.spacebar.editor.savedState",
  ]
end
