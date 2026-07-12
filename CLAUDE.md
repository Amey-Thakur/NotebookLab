# NotebookLab

Offline-first AI knowledge workspace with thinking partner capabilities.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS + TanStack Query + Zustand
- **Backend:** Rust (Tauri v2)
- **Database:** SQLite (WAL, FTS5, cascade deletes)
- **LLM:** bundled llama.cpp sidecar (GGUF models) + any OpenAI-compatible provider
- **Embeddings:** provider /v1/embeddings + brute-force cosine search in Rust

## Architecture

Modular, layered backend. Each module is self-contained and removable.

```
Commands (async Tauri IPC) -> Services (business logic) -> Repositories (data access)
                                                        -> Providers (LLM abstraction)
                                                        -> Parsers (document formats)
```

## Coding Standards

- Every file starts with a header block (Name, Purpose, Description, Tech Stack, License, Authors, Date)
- Comments explain "why" not "what"
- Complete naming, no abbreviations
- IPC arguments are snake_case on both sides; every command declares
  `rename_all = "snake_case"` (tests enforce this)
- Long-running commands are async (`spawn_blocking`); sync commands run on the
  main thread and must stay fast
- User-facing errors go through `formatError` (frontend) / `AppError` (backend)

## Quality Gates

Run before every push; CI enforces all of them on three platforms:

```
npm run lint && npm test && npm run build
cd src-tauri && cargo fmt --all -- --check && cargo clippy --all-features -- -D warnings && cargo test
```

## Commit Format

```
[1-3 word message]

* [1-5 word bullet]
* [1-5 word bullet]

Co-authored-by: Amey Thakur <ameythakur20@gmail.com>
Co-authored-by: Archit Konde <architkonde19@gmail.com>
```
