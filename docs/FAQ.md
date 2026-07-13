# Frequently asked questions

Straight answers to the questions people actually ask.

**Jump to:**
[Privacy and data](#privacy-and-data) ·
[Models and AI](#models-and-ai) ·
[Using the app](#using-the-app) ·
[Troubleshooting](#troubleshooting)

<br>

## Privacy and data

**Does my data ever leave my computer?**
Not unless you connect a cloud provider yourself. Documents, notes, chats,
and embeddings live in a local SQLite database. The bundled model runs
offline. If you do connect a cloud provider, it receives only the context
for the specific question you ask, and nothing else.

**Where exactly is my data stored?**
One SQLite file in your app data directory. Settings shows the exact path
on your machine.

**How do I back everything up?**
Copy the data directory shown in Settings. Restoring is copying it back.
Individual notes also export as Markdown from the editor.

**Is there telemetry or analytics?**
No. The app makes no network requests except the ones you can see: model
downloads you start, providers you connect, and the update check against
GitHub Releases.

<br>

## Models and AI

**Do I need an account or API key?**
No. Download the bundled model once (about 2 GB) and everything works
offline. API keys only matter if you choose a cloud provider.

**What hardware do I need?**
The default model (Llama 3.2 3B, quantized) runs comfortably on 8 GB of
RAM. More RAM lets you run larger models through Ollama or LM Studio.

**Can I use my own models?**
Yes, two ways. Drop a GGUF file into the models folder inside your data
directory and start the local server from Models. Or run any
OpenAI-compatible server (Ollama, LM Studio, llama.cpp) and connect it on
the Models page.

**Why do answers cite sources?**
Chat retrieves the most relevant passages from your documents before
asking the model, then stores which passages grounded each answer. The
chips under every answer are those real passages, with document, heading,
and page.

**What is hybrid search?**
Keyword search with BM25 ranking always works. When your provider supports
embeddings (Ollama does), a semantic similarity signal is blended in, so
you find passages that match your meaning, not just your words.

<br>

## Using the app

**What file types can I import?**
PDF, Word (`.docx`), plain text, Markdown, and images (`.png`, `.jpg`, `.jpeg`,
`.tiff`, `.webp`, `.bmp`), up to 50 MB per file. Images are read with offline
OCR, so a photo or scan of printed text becomes searchable like any other
source. OCR works best on clear, printed text; handwriting and very low
resolution scans read less reliably. Legacy binary Word (`.doc`) is not
supported; save it as `.docx` first.

**Does OCR need the internet?**
No. The OCR models ship with the app and run entirely on your machine, like
everything else in NotebookLab.

**Can I share a notebook or move it to another computer?**
Yes. On the Notebooks page, hover a notebook and choose Export to save it as a
single `.nblab` file. That file is self-contained: it holds the notebook, its
notes, its documents (as searchable text), and its canvas, with no original
source files needed. On the other machine, use Import on the Notebooks page to
recreate the notebook. It all works offline.

**What is the Canvas?**
Every notebook has one open canvas for visual thinking. Draw freehand with the
pen, add rectangles, ellipses, and text, and drop in images, then pan, zoom,
and rearrange. Drag the empty space to pan, scroll to zoom, and press Delete to
remove a selected item; undo and redo work as usual. Everything you make is
saved with the notebook and stays on your machine.

**What is the Studio?**
The Studio turns a notebook's documents into study aids and write-ups: a
structured study guide, flashcards, a multiple-choice quiz, a visual mind map, a
timeline, a slide deck, a data table, a briefing doc, and a blog post. Everything
it makes is grounded in your own sources. Open a notebook, open Studio, choose a
format, and generate. Add a focus to narrow it, or leave it blank to cover the
whole notebook.

**How do wiki-links work?**
Type `[[Note Title]]` in any note. Clicking it opens that note, creating
it first if needed. The backlinks panel under the editor shows every note
that links to the one you are reading.

**What keyboard shortcuts exist?**
Press `?` anywhere to see the full list. Ctrl+K opens search, Ctrl+N creates
a note in the active notebook, and Ctrl+S saves the open note immediately.
Type `G` then a key to jump between pages, for example `G` then `N` for
Notebooks. Auto-save also runs every two seconds. On macOS, use Cmd instead
of Ctrl.

**Does it update itself?**
Yes, on Windows and macOS the app checks GitHub Releases and updates
automatically. On Linux, install the new `.deb` or `.rpm` when a release
lands.

**Can other programs read my notebooks?**
Yes, through the local REST API on `127.0.0.1:8484`. Settings shows the
session token and a copy-ready curl command. Read-only, localhost-only.

<br>

## Troubleshooting

**macOS says the app cannot be opened.**
The builds are not yet notarized with Apple. Right-click the app, choose
Open, and confirm once. That decision sticks.

**The local AI server will not start.**
Check that a model finished downloading in Models, and that your machine
has enough free memory for it. A crashed server shows a Restart button;
one click brings it back.

**Chat says no model is connected.**
Open Models. Either start the local server, or press "Check for providers"
if you run Ollama or LM Studio and started it after the app.

**The model download failed halfway.**
Press Retry. Downloads resume clean because files are verified and moved
into place only when complete.

**Something else is wrong.**
Ask in [Discussions](https://github.com/Amey-Thakur/NotebookLab/discussions)
or open a [bug report](https://github.com/Amey-Thakur/NotebookLab/issues/new/choose)
with the steps that reproduce it.
