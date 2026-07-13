# Contributing to NotebookLab

Thanks for wanting to help. This guide covers everything you need to go from
clone to merged pull request.

**Jump to:**
[Setup](#setup) ·
[Project layout](#project-layout) ·
[Quality gates](#quality-gates) ·
[Conventions](#conventions) ·
[Commit format](#commit-format) ·
[Pull requests](#pull-requests)

## Setup

Prerequisites: [Node.js](https://nodejs.org/) 22+ and [Rust](https://rustup.rs/) 1.77+.
On Linux, install the WebKitGTK stack first:

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

Then:

```bash
git clone https://github.com/Amey-Thakur/NotebookLab.git
cd NotebookLab
npm ci
npm run sidecar:download
npx tauri dev
```

## Project layout

```
src/                 React frontend, organized by feature
src-tauri/src/       Rust backend: commands -> services -> repositories
site/                Static landing page (GitHub Pages)
scripts/             Build helpers (sidecar download)
.github/workflows/   CI, release, and pages pipelines
```

## Quality gates

Every pull request must pass all of these. Run them locally before pushing:

```bash
npm run lint                 # eslint, zero warnings expected
npm test                     # vitest
npm run build                # typecheck + bundle

cd src-tauri
cargo fmt --all -- --check   # formatting
cargo clippy --all-features -- -D warnings
cargo test
```

## Conventions

- **Every file starts with a header block**: Name, Purpose, Description, Tech
  Stack, License, Authors, Date. Look at any existing file for the shape.
- **Comments explain why, not what.** If a comment restates the code, delete it.
- **Complete naming, no abbreviations.** `notebook_id`, not `nb_id`.
- **IPC arguments are snake_case** on both sides. Every Tauri command declares
  `rename_all = "snake_case"`; tests enforce this on both the Rust and
  TypeScript sides.
- **No placeholder code.** If a feature is not finished, it does not ship a
  dead button.
- Errors shown to users go through `formatError` (frontend) and the
  `AppError` enum (backend). No raw error dumps in the UI.

## Commit format

Subjects are short (one to three words), with bullet details:

```
Fix search ranking

* Blend vector and keyword scores
* Cap results at 20
```

## Pull requests

1. Branch from `main`.
2. Keep the change focused; unrelated cleanups go in their own PR.
3. Fill in the PR template and note anything you could not test locally.
4. CI must be green on Linux, Windows, and macOS.

## Reporting bugs and requesting features

Use the [issue templates](https://github.com/Amey-Thakur/NotebookLab/issues/new/choose).
For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.
