# Documentation

Everything about NotebookLab, one page away.

<br>

| I want to... | Read this |
|--------------|-----------|
| Install and use the app | [Main README](../README.md) |
| Get a quick answer | [FAQ](FAQ.md) |
| Ask a question or share an idea | [Discussions](https://github.com/Amey-Thakur/NotebookLab/discussions) |
| Understand how it works inside | [Architecture](ARCHITECTURE.md) |
| Set up a dev environment and contribute | [Contributing guide](../.github/CONTRIBUTING.md) |
| Report a security problem | [Security policy](../.github/SECURITY.md) |
| Know what changed between versions | [Changelog](../CHANGELOG.md) |
| Cut a release (maintainers) | [Releasing](RELEASING.md) |
| Understand community expectations | [Code of conduct](../.github/CODE_OF_CONDUCT.md) |

<br>

## Repository layout

Every file and folder in the repository root is there because a tool
resolves it at that exact path. Everything movable has been moved.

| Root entry | Why it is at root |
|------------|-------------------|
| `src/`, `src-tauri/` | frontend and backend source; Vite and Tauri locate them by convention |
| `site/`, `scripts/`, `docs/`, `config/`, `.github/` | landing page, build helpers, guides and brand assets, all build configs, GitHub metadata |
| `README.md`, `CHANGELOG.md`, `LICENSE`, `codemeta.json` | project front door, history, license, software metadata; all standard at root |
| `CLAUDE.md` | AI assistant project instructions, discovered at root |
| `package.json`, `package-lock.json` | npm requires them at root |
| `tsconfig.json` | TypeScript project root; points into `config/` for the rest |
| `.gitignore`, `.gitattributes` | Git resolves both here: ignore rules, and LF normalization with binary markers |

Everything else lives one level down: the Vite entry `index.html` sits in
`src/`, and the Vite, ESLint, Tailwind, and secondary TypeScript configs sit
in `config/`, passed to their tools explicitly by the npm scripts.

<br>

## Quick facts

- **Stack:** React 19 + TypeScript frontend, Rust backend, Tauri v2 shell,
  SQLite storage, llama.cpp for local AI.
- **Privacy:** everything runs and stays on your machine; cloud providers
  are optional and off by default.
- **Platforms:** Windows, macOS (Apple Silicon and Intel), Linux.
- **License:** MIT, by [Amey Thakur](https://github.com/Amey-Thakur) and
  [Archit Konde](https://github.com/Archit-Konde).
