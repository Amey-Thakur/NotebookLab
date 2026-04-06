# Changelog

All notable changes to NotebookLab will be documented in this file.

## [0.1.0] - 2026-04-06

### Added

**Core**
- Tauri v2 desktop application (Windows, macOS, Linux)
- SQLite database with WAL mode, foreign keys, and FTS5 full-text search
- 34 Tauri IPC commands across 9 modules
- REST API server on localhost:8484 for external automation
- CI/CD pipeline with GitHub Actions (lint, typecheck, cargo check, clippy)
- Cross-platform release workflow (Windows .msi, macOS .dmg, Linux .AppImage/.deb)
- Dependabot for npm, Cargo, and GitHub Actions dependency updates

**Documents**
- Import PDF, TXT, and Markdown files
- Paragraph-aware text chunking with overlap for RAG retrieval
- SHA-256 file deduplication
- PDF page extraction with heading detection
- Markdown frontmatter stripping and heading extraction
- File size guard (50MB max)

**Editor**
- Milkdown WYSIWYG Markdown editor with GFM support
- Wiki-link `[[...]]` decoration plugin with styled inline marks
- Debounced auto-save (2 second interval) with unmount cleanup
- Title editing with blur-save

**AI Features**
- RAG chat with citations (3-phase lock-free pipeline)
- Multi-provider AI support (Ollama, llama.cpp, LM Studio, OpenAI-compatible)
- Thinking Partner: mind map generation from documents
- Thinking Partner: Socratic questioning mode
- Content transformations: summarize, extract key points, custom prompts
- FTS5 search with BM25 relevance ranking (LIKE fallback)
- Prompt injection defense in all 4 LLM prompt templates

**UI**
- 10 frontend pages (Notebooks, Detail, Editor, Search, Chat, Think, Transform, Models, Settings, Podcasts)
- Dark and light themes with CSS custom properties
- Design system: Play + Source Serif 4 + JetBrains Mono typography
- Color palette: #EFECE3, #8FABD4, #4A70A9, #000000
- Dynamic status bar (active provider + indexed chunk count)
- First-run sample notebook with 2 getting-started notes
- Zustand store for active notebook context (persisted to localStorage)

**Security**
- Content Security Policy (CSP) with restrictive defaults
- Tauri capabilities scoped to app-specific directory
- SSRF validation on provider URLs (scheme, private IP blocklist, loopback restriction)
- HTTPS enforcement for API key transmission to cloud providers
- Error message sanitization (no internal details leaked to frontend)
- Path canonicalization on file imports
- All SQL queries parameterized (zero injection vectors)

### Not Yet Implemented
- AI Podcasts (TTS engine decision pending)
- Semantic vector search (sqlite-vec integration planned)
- DOCX parser
- Image OCR
- Knowledge graph visualization
- Spatial canvas view
