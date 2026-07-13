# Changelog

All notable changes to NotebookLab will be documented in this file.

## [Unreleased]

## [0.4.0] - 2026-07-13

### Added

- Share a notebook. Export any notebook to a single self-contained file that
  holds the notebook, its notes, its documents (as their extracted, searchable
  text), and its canvas, then import that file on another machine to recreate
  the notebook, fully offline and with no original source files needed. Import
  and export live on the Notebooks page; a half-finished import is rolled back
  so nothing partial is left behind.
- Audio overview formats. The audio overview (read aloud in the browser) can now
  be a two-host discussion, a one-minute brief from a single narrator, a debate
  between opposing speakers, or a critique that weighs the material's strengths
  and gaps. Each is grounded in the notebook's sources, and the prompts now keep
  document text strictly as data.
- More Studio formats. Alongside the study guide, flashcards, quiz, and mind
  map, the Studio can now turn a notebook's sources into a timeline, a slide
  deck, a data table, a briefing doc, and a blog post. Each one is grounded in
  your own documents and renders in its own real view, with the timeline, deck,
  and table laid out visually and the reports read as formatted prose.
- Canvas workspace. Every notebook now has one open spatial canvas: draw
  freehand with a pressure-aware pen, add rectangles, ellipses, and text, drop
  in images, and arrange it all together. Pan by dragging the empty space, zoom
  toward the cursor, select and move or delete anything, and undo/redo. The
  whole scene, images included, is stored with the notebook and autosaves as you
  work, so it stays self-contained and offline. Built on a small custom SVG
  engine and perfect-freehand rather than a heavy whiteboard library, so it
  matches the app's look and adds almost nothing to the bundle.
- Word and image import. Bring in Word (`.docx`) files, and images or scans of
  printed text (`.png`, `.jpg`, `.jpeg`, `.tiff`, `.webp`, `.bmp`). Images are
  read with fully offline OCR, no cloud and no network, so a photo or scan
  becomes searchable content like every other source and flows into search,
  chat, and the Studio. The OCR models are bundled and verified by checksum; if
  they are ever missing, image import degrades to a clear message instead of
  failing quietly. Word and text formats never load the models.
- Studio: turn a notebook's documents into study aids grounded in your own
  sources. A structured study guide, interactive flashcards, a scored
  multiple-choice quiz, and a real visual mind map. Add a focus to narrow it or
  leave it blank to cover the whole notebook.
- Visual mind maps: the mind map now renders as an actual tree of connected
  ideas, in the Studio and in the Thinking Partner, replacing the text preview.
- Home: a calm landing screen with a greeting, quick actions, your recent
  notes, and a preview of your notebooks.
- Universal search launcher: one keyboard-first box (Ctrl+K, or the header
  Search button) to reach any page, notebook, or action.
- Keyboard shortcut system with a shared registry and a cheat sheet: press `?`
  anywhere to see every binding, grouped by area. Navigate by typing `G` then
  a key (`G` `N` for Notebooks, `G` `A` for About, and so on). The Settings
  page reads the same registry, so the list can never drift from what is wired.
- First-run welcome: a short, spacious greeting on the first launch that
  introduces the app, lets you pick a theme, and points out the keys worth
  knowing. Shown once.
- Animated light and dark toggle in the header: a real switch whose knob slides
  between a sun and a moon, with the active side lit in the accent color.
- About page: the people behind NotebookLab, why it exists, portraits pulled
  live from GitHub, and the Makers' Pledge, a certificate carrying the
  fingerprint of the key that signs every commit and release.
- The Makers' Pledge as a signed certificate of authenticity: shown on the
  website and in the README, and available as a one-click download.
- A single brand mark component, drawn from the packaged app icon, now used
  consistently in the header, the welcome flow, and the About page.
- A shared, accessible dialog primitive (focus trap, Escape to close, reduced
  motion aware) behind the welcome and cheat sheet overlays.

### Fixed

- Word export kept the numbers on numbered lists and now emits emoji and other
  characters beyond the basic range as valid document text.
- The Connections graph no longer counts a phantom link after a linked note is
  deleted; a note's connection count always matches the lines drawn.
- Prompt Studio ignores an empty rewrite and never lets a slow refinement land
  on top of an edit you made while it was running.

## [0.3.0] - 2026-07-12

### Added

- Prompt Studio: build a clear prompt from simple parts (role, task, context,
  format, tone, constraints, examples) with a live preview, then sharpen it
  with the active model. It teaches prompt structure by showing it.
- Connections: a calm diagram of how the notes in a notebook link to each
  other, with an accessible list of the most-connected notes.
- Document outline: a navigable tree of a document's sections, built from its
  real heading structure, that jumps to any passage.
- Word export: save a note as an RTF document that opens in Word, Pages, or
  LibreOffice with real formatting, alongside the existing Markdown export.
- Command palette: Ctrl+K opens one box to jump to any page or notebook, or
  run an action, fully keyboard driven.
- Drag and drop import: drop PDF, TXT, or Markdown files anywhere on the
  window to import them, with a live drop target.
- "Pick up where you left off": the notebooks page surfaces your three most
  recently edited notes across all notebooks.
- Regenerate: ask the same question again on the latest chat answer.
- Note export to Markdown from the editor.
- Live word count in the editor.
- Rename a notebook by editing its title in place.
- Copy button on every chat answer.

### Fixed

- Auto-update actually runs now. The updater plugin was registered but never
  invoked, so no install ever checked for or applied updates. The app now
  checks on launch, downloads in the background, and the status bar offers a
  one-click restart when a new version is staged.

### Changed

- Removed the last unwired backend commands; every registered command now has
  a real caller in the interface, the REST API, or the system layer.
- README leads with a branded hero illustration of the cited-answer flow.

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
  crash, with live status.
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
- Release pipeline: version guard, SHA256SUMS, automatic publishing, and all
  actions pinned to commit SHAs. Auto-update covers Windows and macOS; Linux
  updates ship through the .deb and .rpm packages.
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
