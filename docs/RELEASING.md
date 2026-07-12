# Releasing NotebookLab

The release pipeline is automated end to end. A maintainer's job is three
commands; the workflow does the rest.

## Steps

1. **Bump the version** in all three manifests. They must match, or the
   release workflow fails on purpose:

   - `package.json` (`version`)
   - `src-tauri/Cargo.toml` (`version`, and refresh `Cargo.lock`)
   - `src-tauri/tauri.conf.json` (`version`)

2. **Update `CHANGELOG.md`** with a new section for the version, dated.

3. **Commit, tag, and push**:

   ```bash
   git commit -am "Release v0.2.0"
   git tag v0.2.0
   git push && git push --tags
   ```

## What the workflow does

On a `v*` tag, `.github/workflows/release.yml`:

1. Verifies the tag matches the committed versions (fails fast if not).
2. Builds installers on four runners: Windows (`.msi`, `-setup.exe`),
   macOS Intel and Apple Silicon (`.dmg`), Linux (`.AppImage`, `.deb`, `.rpm`).
3. Signs update bundles with the Tauri updater key and generates
   `latest.json` (secrets `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
4. Collects everything on a draft release.
5. After all platforms succeed: generates `SHA256SUMS`, uploads it, and
   publishes the release as latest.

Publishing is what makes `releases/latest/download/latest.json` resolve, which
is the endpoint installed apps poll for auto-updates. If any platform build
fails, the draft stays unpublished and users see nothing half-finished.

## After the release

- Check the [releases page](https://github.com/Amey-Thakur/NotebookLab/releases)
  shows all assets: installers per platform, update bundles with `.sig` files,
  `latest.json`, and `SHA256SUMS`.
- Install the Windows or macOS build once and confirm it launches and shows
  the new version in Settings.
- Older installs pick up the update automatically on next launch.
