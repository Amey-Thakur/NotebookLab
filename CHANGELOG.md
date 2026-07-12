# Changelog

All notable changes to NotebookLab will be documented in this file.

## [0.2.0] - 2026-07-12

### Fixed

**Critical**
- IPC argument casing mismatch that broke chat, search, document import and
  listing, notes, transforms, thinking partner, and podcasts at runtime.
  All commands now use snake_case arguments, enforced by tests on both sides.
- Long AI calls ran on the main thread and froze the whole app for up to two
  minutes. Chat, transforms, thinking partner, podcasts, search, and import
  are now async on worker threads.
- Installers shipped `llama-server` without the shared libraries it loads, so
  the bundled local AI could never start. Libraries are now downloaded,
  checksum verified, bundled, and found at runtime on all three platforms.
- Auto-update was dead end to end: update artifacts were never generated and
  the updater endpoint pointed at a release that never resolved. Releases now
  produce signed update bundles plus `latest.json` and publish automatically.
- A crashed local server could never be restarted, stop left it marked as
  crashed, and quitting the app orphaned the llama-server process.
- Restarting the sidecar accumulated duplicate dead providers.
- Auto-detected providers registered a hardcoded model name instead of the
  model the server actually has loaded.
- The REST API token was generated and thrown away, so every documented
  endpoint returned 401 forever. The token now appears in Settings.
- Malformed PDFs could abort the entire app; imports now fail with an error.
- Podcast generation crashed on documents with non-ASCII text.
- Editor auto-save could resurrect stale content over newer edits, silently
  dropped edits made just before navigating away, and swallowed failures
  without any indication. There is now a save status indicator.
- The message you sent disappeared during the AI's thinking time, and errors
  discarded your draft. Messages now render immediately and failed drafts
  return to the input.
- Deleting a notebook relied on a dialog that silently never appears on
  macOS. All destructive actions now use in-app two-step confirmation.
- Notes could not be deleted from the interface at all.
- Search hid page 1 results' page numbers when the page number was zero.
- Podcast playback continued after leaving the page.
- The sample notebook resurrected after users deleted every notebook.

### Added

- Citations under every chat answer: source chips with document title,
  heading, page, and an expandable snippet, backed by real retrieval scores.
- Conversation history: resume, continue, and delete past chats.
- Semantic search: documents are embedded in the background after import and
  queries blend vector similarity with keyword ranking when available.
- Wiki-links now navigate: clicking `[[a note]]` opens it, creating it first
  if needed. A backlinks panel shows which notes link to the open one.
- Local AI server controls on the Models page: start, stop, restart after a
  crash, with live status. The bundled server now serves embeddings too.
- Keyboard shortcuts, for real this time: Ctrl+K search, Ctrl+N new note,
  Ctrl+S save now. The header search button works.
- "Check for providers" actually re-probes local endpoints.
- Local REST API section in Settings with the session token and a copy-ready
  curl command.
- Friendly error messages with recovery hints across every page.

### Changed

- Accessibility pass: every card and result reachable by keyboard, WCAG AA
  contrast in both themes, visible focus everywhere, labels on all form
  fields, screen reader announcements for chat, reduced motion support, and
  a rem-based type scale that honors system text size.
- Deeper, richer blue accent palette in both themes.
- Release pipeline: version guard, SHA256SUMS, automatic publishing, Linux
  AppImage restored for the updater, all actions pinned to commit SHAs.
- CI: rustfmt gate, frontend tests on all three platforms.
- Windows and macOS icons are now real multi-resolution assets.
- Sidecar downloads are verified against pinned SHA256 checksums.
- Removed the unused filesystem plugin, dead commands, and the dead model
  registry to shrink the attack surface.

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

### Known gaps in 0.1.0 (closed in 0.2.0)
- AI podcasts, semantic vector search, and the auto-updater shipped after
  this release; see 0.2.0.

### Not yet implemented
- DOCX parser
- Image OCR
- Knowledge graph visualization
- Spatial canvas view
