/*
 * Name: download-sidecar.cjs
 * Purpose: Downloads the pre-built llama-server binary and its shared
 *   libraries for the current platform.
 * Description: The binary lands in src-tauri/binaries/ with Tauri's
 *   {name}-{target-triple} naming; the libraries land in
 *   src-tauri/binaries/libs/ and are bundled as resources. Fetches
 *   from the official llama.cpp GitHub releases and verifies the
 *   archive against a pinned SHA256 before extracting. The release
 *   binaries link against shared libraries shipped in the same
 *   archive (ggml*.dll / *.dylib / *.so); shipping the binary
 *   alone leaves the local AI server unable to start. Run before
 *   `cargo tauri build` or `cargo tauri dev`; skipped
 *   automatically when files already exist.
 * Tech Stack: Node.js
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/* llama.cpp release to download (pinned for reproducibility).
   When bumping: download each asset, run `sha256sum <file>`, update the map. */
const LLAMA_CPP_VERSION = "b5200";

/* Map Node.js platform/arch to Tauri target triple, release asset, and checksum */
const PLATFORM_MAP = {
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-win-avx2-x64.zip`,
    binary: "llama-server.exe",
    ext: ".exe",
    sha256: "bd37c76f6986ae8a3e64ae9929e1103a161c0b72837ba3925e9628d8d868823a",
  },
  "darwin-x64": {
    triple: "x86_64-apple-darwin",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-macos-x64.zip`,
    binary: "llama-server",
    ext: "",
    sha256: "c19e1d4fc104b38ad4a177b54db9e9dd2e8c39c0c0ca0fd461a16f4540380219",
  },
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip`,
    binary: "llama-server",
    ext: "",
    sha256: "25f852f7426d2da25f97f8682356ae2ca3f21c4a6295ba2c74556fca042b7a62",
  },
  "linux-x64": {
    triple: "x86_64-unknown-linux-gnu",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-ubuntu-x64.zip`,
    binary: "llama-server",
    ext: "",
    sha256: "667eb5bc6f221167fdfb95faa9f171ff1cd331432eafebdbe4c2e7bb752256f6",
  },
};

/* Shared library files the server binary loads at runtime */
const LIBRARY_PATTERN = /\.(dll|dylib|so(\.\d+)*)$/;

/* SIDECAR_TRIPLE overrides host detection for cross-compiled builds.
   Intel macOS installers are built on ARM runners (GitHub retired the
   Intel fleet), so the build passes the Rust target triple explicitly. */
const tripleOverride = process.env.SIDECAR_TRIPLE;
const platformKey = tripleOverride
  ? Object.keys(PLATFORM_MAP).find((k) => PLATFORM_MAP[k].triple === tripleOverride)
  : `${process.platform}-${process.arch}`;
const config = platformKey ? PLATFORM_MAP[platformKey] : undefined;

if (!config) {
  console.error(`Unsupported platform: ${tripleOverride || platformKey}`);
  console.error(`Supported triples: ${Object.values(PLATFORM_MAP).map((p) => p.triple).join(", ")}`);
  process.exit(1);
}

const binDir = path.join(__dirname, "..", "src-tauri", "binaries");
const libDir = path.join(binDir, "libs");
const outputName = `llama-server-${config.triple}${config.ext}`;
const outputPath = path.join(binDir, outputName);

/* Skip if the binary and at least one library are already in place */
if (fs.existsSync(outputPath) && fs.existsSync(libDir)) {
  const stats = fs.statSync(outputPath);
  const libCount = fs.readdirSync(libDir).filter((f) => LIBRARY_PATTERN.test(f)).length;
  if (stats.size > 1_000_000 && libCount > 0) {
    console.log(`Sidecar already exists: ${outputName} (${(stats.size / 1024 / 1024).toFixed(1)} MB, ${libCount} libraries)`);
    process.exit(0);
  }
}

const downloadUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/${config.asset}`;

console.log(`Downloading llama-server for ${platformKey}...`);
console.log(`  Release: ${LLAMA_CPP_VERSION}`);
console.log(`  Asset: ${config.asset}`);
console.log(`  Target: ${outputName}`);

/* Ensure output directories exist */
fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(libDir, { recursive: true });

const tmpZip = path.join(binDir, "llama-server-download.zip");

/* Download using curl (available on all platforms) */
try {
  execSync(
    `curl -L --fail --progress-bar -o "${tmpZip}" "${downloadUrl}"`,
    { stdio: "inherit" }
  );
} catch (err) {
  console.error(`Download failed. URL: ${downloadUrl}`);
  console.error("Check that the release version exists at https://github.com/ggml-org/llama.cpp/releases");
  process.exit(1);
}

/* Verify SHA256 checksum before touching the archive contents */
const hash = crypto.createHash("sha256");
hash.update(fs.readFileSync(tmpZip));
const actual = hash.digest("hex");

if (actual !== config.sha256) {
  console.error("Checksum mismatch!");
  console.error(`  Expected: ${config.sha256}`);
  console.error(`  Actual:   ${actual}`);
  console.error("The download may be corrupted or tampered with. Aborting.");
  try { fs.unlinkSync(tmpZip); } catch (_) { /* best effort */ }
  process.exit(1);
}
console.log(`Checksum verified: ${actual.slice(0, 16)}...`);

/* Extract llama-server and its shared libraries from the archive */
console.log("Extracting llama-server and shared libraries...");

try {
  const extractDir = path.join(binDir, "llama-extract");

  if (process.platform === "win32") {
    execSync(
      `powershell -Command "Expand-Archive -Force -Path '${tmpZip}' -DestinationPath '${extractDir}'"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`unzip -o -q "${tmpZip}" -d "${extractDir}"`, { stdio: "inherit" });
  }

  const serverBin = findFile(extractDir, (name) => name === config.binary);
  if (!serverBin) {
    console.error(`Could not find ${config.binary} in extracted archive`);
    cleanup();
    process.exit(1);
  }

  fs.copyFileSync(serverBin, outputPath);
  if (process.platform !== "win32") {
    fs.chmodSync(outputPath, 0o755);
  }

  /* Copy every shared library next to the extraction so the server can load
     them at runtime (bundled as resources; see tauri.conf.json). */
  const libraries = findAllFiles(extractDir, (name) => LIBRARY_PATTERN.test(name));
  for (const lib of libraries) {
    const target = path.join(libDir, path.basename(lib));
    fs.copyFileSync(lib, target);
    if (process.platform !== "win32") {
      fs.chmodSync(target, 0o755);
    }
  }

  cleanup();

  const finalSize = fs.statSync(outputPath).size;
  console.log(`Done! ${outputName} (${(finalSize / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Libraries: ${libraries.map((l) => path.basename(l)).join(", ") || "none found"}`);

  if (libraries.length === 0) {
    console.error("No shared libraries found in the archive; llama-server will not start.");
    process.exit(1);
  }
} catch (err) {
  console.error("Extraction failed:", err.message);
  cleanup();
  process.exit(1);
}


/* Recursively find the first file whose name matches the predicate */
function findFile(dir, predicate) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, predicate);
      if (found) return found;
    } else if (predicate(entry.name)) {
      return fullPath;
    }
  }
  return null;
}


/* Recursively find all files whose names match the predicate */
function findAllFiles(dir, predicate) {
  const matches = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findAllFiles(fullPath, predicate));
    } else if (predicate(entry.name)) {
      matches.push(fullPath);
    }
  }
  return matches;
}


/* Clean up temporary files */
function cleanup() {
  try { fs.unlinkSync(tmpZip); } catch (_) { /* best effort */ }
  try { fs.rmSync(path.join(binDir, "llama-extract"), { recursive: true, force: true }); } catch (_) { /* best effort */ }
}
