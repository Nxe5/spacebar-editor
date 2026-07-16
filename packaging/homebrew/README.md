# Homebrew distribution

Spacebar Editor ships on macOS as a **Homebrew Cask** (prebuilt `.app`), not a source Formula.

## For users

After the tap is published:

```bash
brew tap Jiguey/spacebar
brew install --cask spacebar-editor
spacebar .
```

Direct download remains available from [GitHub Releases](https://github.com/Jiguey/spacebar-editor/releases).

## For maintainers

### 1. Bundle the CLI in the app

`src-tauri/tauri.conf.json` includes `scripts/spacebar-cli.sh` as a bundle resource. The cask exposes it as the `spacebar` command.

### 2. Publish a tap

The tap source lives in [`homebrew-spacebar/`](../homebrew-spacebar/) in this repo. Push that directory to GitHub as **`Jiguey/homebrew-spacebar`**:

```bash
cd homebrew-spacebar
git init
git add .
git commit -m "Add spacebar-editor cask"
gh repo create Jiguey/homebrew-spacebar --public --source=. --push
```

Homebrew expects the tap URL pattern `https://github.com/Jiguey/homebrew-spacebar`.

### 3. Update the cask after each release

From the main repo, after the release `.dmg` is uploaded:

```bash
pnpm update-homebrew-cask
```

This updates both `packaging/homebrew/spacebar-editor.rb` and `homebrew-spacebar/Casks/spacebar-editor.rb` with the current version and `sha256`. Then commit and push the tap repo:

```bash
cd homebrew-spacebar && git commit -am "spacebar-editor vX.Y.Z" && git push
```

### 4. Artifact naming

The release workflow builds a universal macOS `.dmg` via Tauri. The cask URL uses:

`Spacebar.Editor_<version>_universal.dmg`

(Tauri uses dots in the product name, not spaces.)
