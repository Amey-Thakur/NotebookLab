# Security Policy

## Supported versions

Only the latest release receives security fixes. The app updates itself
automatically, so staying current is the default.

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report privately through
[GitHub Security Advisories](https://github.com/Amey-Thakur/NotebookLab/security/advisories/new),
or email the maintainers listed in the repository profile.

Include what you found, steps to reproduce it, and the impact you believe it
has. You will get an acknowledgment within a week, and a fix or a clear plan
within 30 days for confirmed reports.

## Scope notes

Things that are part of the security design, useful context when assessing a
finding:

- The REST API binds to `127.0.0.1` only and requires a bearer token that is
  regenerated on every launch. The token is never written to disk.
- The bundled `llama-server` binds to `127.0.0.1` on a random port with a
  per-session key.
- Model downloads are restricted to HTTPS `huggingface.co` URLs; the sidecar
  archive download is pinned to a specific llama.cpp release and verified
  against a SHA256 checksum.
- All SQL goes through parameterized queries.
- The webview CSP allows connections to the Tauri IPC origin only.
