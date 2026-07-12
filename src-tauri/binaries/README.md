# Sidecar binaries

This directory holds the `llama-server` binary and its shared libraries.
They are not committed; fetch them with:

```bash
npm run sidecar:download
```

The script downloads the pinned llama.cpp release for your platform, verifies
its SHA256 checksum, and places:

- `llama-server-<target-triple>[.exe]` here (Tauri sidecar naming)
- shared libraries (`ggml*`, `llama`, `libcurl`) in `libs/`

Both are required: the release binaries load the shared libraries at runtime.
Installers bundle `libs/` as the `llama-libs` resource directory.
