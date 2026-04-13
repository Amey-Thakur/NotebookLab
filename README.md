# NotebookLab

Your thinking partner, on your machine.

NotebookLab is an offline-first AI knowledge workspace that combines the best of Google NotebookLM (RAG, citations, AI-powered analysis) with Obsidian (Markdown-first, local storage, bi-directional linking). All AI runs locally by default. Cloud providers optional.

## Features

- **Document Ingestion** -- Import PDF, TXT, and Markdown files. Auto-chunked and indexed for AI retrieval.
- **RAG Chat with Citations** -- Ask questions about your documents. Every answer cites specific sources with page numbers.
- **Markdown Editor** -- WYSIWYG editing with `[[wiki-links]]`, auto-save, and GFM support (tables, task lists).
- **Thinking Partner** -- Generate mind maps from your research. Get Socratic questions that challenge your thinking.
- **Content Transforms** -- Summarize, extract key points, or run custom prompts on any document.
- **Full-Text Search** -- FTS5-powered search with BM25 relevance ranking across all your documents and notes.
- **Multi-Provider AI** -- Local models (Ollama, llama.cpp, LM Studio) or cloud (OpenAI, Anthropic). Bring your own keys.
- **Model Manager** -- Register, switch, and manage AI providers from the UI.
- **REST API** -- Local HTTP API on `localhost:8484` for scripting and automation.
- **Dark + Light Themes** -- Design system with Play, Source Serif 4, and JetBrains Mono typography.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App Shell | Tauri v2 (Rust backend + WebView) |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Editor | Milkdown (ProseMirror + Remark) |
| Database | SQLite + FTS5 |
| LLM | llama.cpp / Ollama / OpenAI-compatible |
| Embeddings | ONNX Runtime (planned) |
| Build | Vite + GitHub Actions |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) 1.77+
- [Ollama](https://ollama.com/) (for local AI)

### Setup

```bash
# Clone
git clone https://github.com/Amey-Thakur/NotebookLab.git
cd NotebookLab

# Install dependencies
npm ci

# Pull a local model (optional, for AI features)
ollama pull llama3.2:3b

# Run in development
npx tauri dev
```

### First Run

1. The app creates a **Getting Started** notebook with sample notes
2. Go to **Models** and register Ollama (defaults are pre-filled)
3. Import a document (PDF, TXT, or Markdown)
4. Open **Chat** and ask a question about your document

## Architecture

```
React 19 Frontend
    |
    Tauri IPC (invoke)
    |
Rust Backend
    |--- Commands (thin IPC handlers)
    |--- Services (business logic)
    |--- Providers (LLM abstraction)
    |--- Parsers (PDF, TXT, MD)
    |--- Repositories (SQLite data access)
    |--- API (REST server on :8484)
```

Every module is self-contained. Removing one does not break others.

## REST API

The app runs a local REST API on `http://127.0.0.1:8484` for external automation.

```bash
# Health check
curl http://127.0.0.1:8484/api/health

# List notebooks
curl http://127.0.0.1:8484/api/notebooks

# List notes in a notebook
curl http://127.0.0.1:8484/api/notebooks/{id}/notes

# List documents in a notebook
curl http://127.0.0.1:8484/api/notebooks/{id}/documents
```

## Project Structure

```
src/                    React frontend (features, components, stores)
src-tauri/              Rust backend
  src/commands/         Tauri IPC handlers
  src/services/         Business logic (RAG, ingestion, search)
  src/providers/        LLM provider abstraction
  src/parsers/          Document format parsers
  src/database/         SQLite models and repositories
  src/api/              REST API server
  resources/            Migrations, prompts, model registry
```

## Contributing

See the commit format in [CLAUDE.md](CLAUDE.md). Every file starts with a header block. Comments explain "why" not "what". 

## License

[MIT](LICENSE)

## Authors

- [Amey Thakur](https://github.com/Amey-Thakur)
- [Archit Konde](https://github.com/architkonde19)
