# OCR models

This directory holds the two offline OCR models NotebookLab uses to read text
from images and scans:

- `text-detection.rten`: finds text regions in an image
- `text-recognition.rten`: reads the characters in each region

They are **not committed** (see `.gitignore`); they are fetched and checksum
verified by `scripts/download-models.cjs`:

```
npm run models:download
```

The files come from the [robertknight/ocrs](https://huggingface.co/robertknight/ocrs)
model repository and are pinned to a SHA256 in the download script. They are
bundled as Tauri resources at build time and loaded at runtime; the app never
references them at compile time, so the build and tests work without them (image
import is simply unavailable until they are present).

Models are `.rten`, the serialized format of the [rten](https://crates.io/crates/rten)
runtime. When bumping `ocrs`/`rten`, refresh these files and their pinned
checksums together, since the format and models evolve in lockstep.
