/*
 * Name: download-models.cjs
 * Purpose: Downloads the offline OCR models used to read images and scans.
 * Description: Fetches the two ocrs model files (text detection and text
 *   recognition) into src-tauri/resources/models/ocr/, where they
 *   are bundled as Tauri resources and loaded at runtime. Each file
 *   is verified against a pinned SHA256 before it is trusted, and an
 *   existing, already-verified file is left untouched so repeat runs
 *   are fast. The models are content-addressed on Hugging Face
 *   (their file names embed a hash), so a pinned checksum stays
 *   valid across future ocrs releases. Unlike the sidecar, these are
 *   platform-independent: the same two files serve every OS. Run
 *   before `cargo tauri build`/`dev` (see package.json models:download).
 * Tech Stack: Node.js
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/* The two ocrs models. URLs point at the immutable, hash-named files in the
   robertknight/ocrs Hugging Face repo; `file` is the stable local name the Rust
   side loads (see image_ocr_parser.rs). When bumping ocrs/rten, re-download and
   update the size + sha256 here, and re-verify the models pair with the runtime. */
const MODELS = [
  {
    file: "text-detection.rten",
    url: "https://huggingface.co/robertknight/ocrs/resolve/main/text-detection-ssfbcj81.rten",
    size: 2523564,
    sha256: "614aafabf27c94d386f7aa036c967c2e47e4b9938fa11531ca8f5698c1ca4c36",
  },
  {
    file: "text-recognition.rten",
    url: "https://huggingface.co/robertknight/ocrs/resolve/main/text-rec-checkpoint-s52qdbqt.rten",
    size: 9716444,
    sha256: "606d9a0414c6b73c99df75b707c11c70d1c8b12e1d4f900922e185fc37bfca65",
  },
];

const outDir = path.join(__dirname, "..", "src-tauri", "resources", "models", "ocr");
fs.mkdirSync(outDir, { recursive: true });

function sha256Of(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

let downloaded = 0;
for (const model of MODELS) {
  const dest = path.join(outDir, model.file);

  /* Skip a file that is already present and verified. */
  if (fs.existsSync(dest) && sha256Of(dest) === model.sha256) {
    console.log(`OCR model already present: ${model.file}`);
    continue;
  }

  console.log(`Downloading OCR model: ${model.file} (${(model.size / 1024 / 1024).toFixed(1)} MB)`);
  try {
    execSync(`curl -L --fail --progress-bar -o "${dest}" "${model.url}"`, { stdio: "inherit" });
  } catch (err) {
    console.error(`Download failed. URL: ${model.url}`);
    process.exit(1);
  }

  const actual = sha256Of(dest);
  if (actual !== model.sha256) {
    console.error("Checksum mismatch!");
    console.error(`  Expected: ${model.sha256}`);
    console.error(`  Actual:   ${actual}`);
    console.error("The download may be corrupted or tampered with. Aborting.");
    try {
      fs.unlinkSync(dest);
    } catch (_) {
      /* best effort */
    }
    process.exit(1);
  }

  console.log(`Checksum verified: ${actual.slice(0, 16)}...`);
  downloaded += 1;
}

console.log(
  downloaded > 0
    ? `Done! ${downloaded} OCR model file(s) ready in resources/models/ocr/.`
    : "All OCR models already in place.",
);
