<!--
  Name: README.md
  Purpose: The press kit: the Handbook and the reference cards, free to reuse.
  Description: Everything here is generated from the repository's own palette,
    typefaces and facts, so a card cannot claim something the app does not do.
    Published so that anyone writing about NotebookLab has an accurate image to
    hand rather than a screenshot of a screenshot.
  Tech Stack: Markdown
  License: MIT
  Authors: Amey Thakur (https://github.com/Amey-Thakur)
           Archit Konde (https://github.com/Archit-Konde)
  Date: 2026-07-28
-->

# Press kit

The Handbook and the reference cards, free to use anywhere, with attribution appreciated but not required. Everything is MIT licensed like the rest of the project.

## Handbook

**[NotebookLab: Handbook](../notebooklab-booklet.pdf)** &middot; 12 pages, A4 landscape, 1.0 MB

What NotebookLab is and is not, a worked answer with its citation, why provenance lives in the chunk shape, a note from both makers, how to pick a model that fits your machine, and what happens to a file between opening it and getting an answer. Every link inside it is clickable, including the download buttons on the last page.

```
https://github.com/Amey-Thakur/NotebookLab/raw/main/docs/notebooklab-booklet.pdf
```

## The cards

Each is 1400x900, built for a feed and readable on a phone.

| Card | What it answers |
| --- | --- |
| [Everything it does](what-it-does.png) | What is this, and will it read my files |
| [Four people who cannot send documents away](use-cases.png) | Is this for someone like me |
| [Where your documents actually go](where-your-documents-go.png) | Where does my file end up |
| [What the privacy claim costs](what-it-costs.png) | Is "nothing leaves your machine" real |

Direct links, ready to paste:

```
https://github.com/Amey-Thakur/NotebookLab/raw/main/docs/press-kit/what-it-does.png
https://github.com/Amey-Thakur/NotebookLab/raw/main/docs/press-kit/use-cases.png
https://github.com/Amey-Thakur/NotebookLab/raw/main/docs/press-kit/where-your-documents-go.png
https://github.com/Amey-Thakur/NotebookLab/raw/main/docs/press-kit/what-it-costs.png
```

## The facts, if you are writing about it

- Desktop app for Windows, macOS and Linux. Free, MIT licensed, no account.
- Reads PDF (including scanned), Word, Markdown, plain text and images. OCR runs on device.
- Every answer cites the document, the heading and the page it used.
- Runs a local model by default: a bundled llama.cpp sidecar with any GGUF, or Ollama. Cloud providers work with your own key and are off until you add one.
- Nothing is uploaded and there is no telemetry. With a local model it works with no network at all.
- macOS builds are signed but not yet notarised, so Gatekeeper asks on first open.

## Colours and type

| | |
| --- | --- |
| Accent | `#2f62b8` |
| Paper | `#EFECE3` |
| Ink | `#141414` |
| Display face | Play |
| Reading face | Source Serif 4 |
| Monospace | JetBrains Mono |

## Rebuilding these

The generators live in the launch kit repository, not here, because they are campaign tooling rather than product code. What is committed here is the output, so this folder is always what was actually published.
