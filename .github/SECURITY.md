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

## Accepted advisories

Advisories that stay open in the dependency graph because no fix exists yet,
with the reasoning and the condition that would change it. Each is re-checked
whenever the Tauri version moves.

### GHSA-wrw7-89jp-8q8g, `glib` 0.18.5 (Linux only)

Unsoundness in the `Iterator` and `DoubleEndedIterator` implementations for
`glib::VariantStrIter`. Medium severity, no CVE.

**No upgrade exists.** The advisory is first patched in glib 0.20.0, and
0.18.5 is the newest release of the 0.18 line, so there is nothing to move to
within the range our tree allows. glib is transitive and absent from
`src-tauri/Cargo.toml`: `gtk` 0.18.2 requires `glib ^0.18`, and `tauri` 2.11.5
requires `gtk ^0.18`. Cargo rejects the bump outright:

```
error: failed to select a version for the requirement `glib = "^0.18"`
candidate versions found which didn't match: 0.20.12
required by package `gtk v0.18.2`
    ... which satisfies dependency `gtk = "^0.18"` of package `tauri v2.11.5`
```

The `gtk` crate is frozen at 0.18.2 because gtk-rs moved on to GTK4, so the
GTK3 line that Tauri v2 builds on will not gain a glib 0.20 release.

**Not reachable here.** The unsound code sits in `VariantStrIter::impl_get`,
which is reachable only through one public entry point, `Variant::array_iter_str`.
No crate in this dependency tree calls it (checked `tauri`, `wry`, `tao`,
`gtk`, `gdk`, `gio`, `webkit2gtk`, `soup3`, `javascriptcore-rs`,
`libappindicator`, `atk`, `pango`), and NotebookLab's own Rust never references
glib. The code is compiled into Linux builds only; Windows and macOS do not
pull in the GTK stack at all.

**Revisit when** Tauri's Linux backend moves to gtk-rs 0.20 or later, at which
point the upgrade becomes possible and this entry should be removed.
