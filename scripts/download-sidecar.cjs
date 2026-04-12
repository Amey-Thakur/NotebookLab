/*
 * Title: download-sidecar.js
 * Tech Stack: Node.js
 * Description: Downloads the pre-built llama-server binary for the current platform.
 *   Places it in src-tauri/binaries/ with the correct Tauri sidecar naming convention.
 * Important Details: Fetches from the official llama.cpp GitHub releases. Binary naming
 *   follows Tauri's {name}-{target-triple} convention. Run this before `cargo tauri build`
 *   or during CI. Skips download if binary already exists and matches expected size.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/* llama.cpp release to download (pin for reproducibility) */
const LLAMA_CPP_VERSION = "b5200";

/* Map Node.js platform/arch to Tauri target triple and llama.cpp release asset name */
/*
 * SHA256 checksums for each platform's zip archive.
 * Update these when bumping LLAMA_CPP_VERSION.
 * To get checksums: download each zip, run `shasum -a 256 <file>`.
 * Set to null to skip verification (not recommended for production).
 */
const PLATFORM_MAP = {
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-win-avx2-x64.zip`,
    binary: "llama-server.exe",
    ext: ".exe",
    sha256: null, /* TODO: populate after first successful download */
  },
  "darwin-x64": {
    triple: "x86_64-apple-darwin",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-macos-x64.zip`,
    binary: "llama-server",
    ext: "",
    sha256: null,
  },
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip`,
    binary: "llama-server",
    ext: "",
    sha256: null,
  },
  "linux-x64": {
    triple: "x86_64-unknown-linux-gnu",
    asset: `llama-${LLAMA_CPP_VERSION}-bin-ubuntu-x64.zip`,
    binary: "llama-server",
    ext: "",
    sha256: null,
  },
};

const platformKey = `${process.platform}-${process.arch}`;
const config = PLATFORM_MAP[platformKey];

if (!config) {
  console.error(`Unsupported platform: ${platformKey}`);
  console.error(`Supported: ${Object.keys(PLATFORM_MAP).join(", ")}`);
  process.exit(1);
}

const binDir = path.join(__dirname, "..", "src-tauri", "binaries");
const outputName = `llama-server-${config.triple}${config.ext}`;
const outputPath = path.join(binDir, outputName);

/* Skip if already downloaded */
if (fs.existsSync(outputPath)) {
  const stats = fs.statSync(outputPath);
  if (stats.size > 1_000_000) {
    console.log(`Sidecar already exists: ${outputName} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    process.exit(0);
  }
}

const downloadUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/${config.asset}`;

console.log(`Downloading llama-server for ${platformKey}...`);
console.log(`  Release: ${LLAMA_CPP_VERSION}`);
console.log(`  Asset: ${config.asset}`);
console.log(`  Target: ${outputName}`);

/* Ensure output directory exists */
fs.mkdirSync(binDir, { recursive: true });

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

/* Verify SHA256 checksum if available */
if (config.sha256) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(tmpZip));
  const actual = hash.digest("hex");

  if (actual !== config.sha256) {
    console.error(`Checksum mismatch!`);
    console.error(`  Expected: ${config.sha256}`);
    console.error(`  Actual:   ${actual}`);
    console.error("The download may be corrupted or tampered with.");
    try { fs.unlinkSync(tmpZip); } catch (_) {}
    process.exit(1);
  }
  console.log(`Checksum verified: ${actual.slice(0, 16)}...`);
} else {
  console.log("WARNING: No SHA256 checksum configured. Skipping integrity verification.");
  console.log("  Set sha256 in PLATFORM_MAP after first successful download for security.");
}

/* Extract llama-server binary from zip */
console.log("Extracting llama-server from archive...");

try {
  if (process.platform === "win32") {
    /* PowerShell extraction on Windows */
    execSync(
      `powershell -Command "Expand-Archive -Force -Path '${tmpZip}' -DestinationPath '${binDir}/llama-extract'"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`unzip -o "${tmpZip}" -d "${binDir}/llama-extract"`, { stdio: "inherit" });
  }

  /* Find llama-server in extracted files */
  const extractDir = path.join(binDir, "llama-extract");
  const serverBin = findFile(extractDir, config.binary);

  if (!serverBin) {
    console.error(`Could not find ${config.binary} in extracted archive`);
    cleanup();
    process.exit(1);
  }

  /* Move to final location with correct name */
  fs.copyFileSync(serverBin, outputPath);

  /* Make executable on Unix */
  if (process.platform !== "win32") {
    fs.chmodSync(outputPath, 0o755);
  }

  cleanup();

  const finalSize = fs.statSync(outputPath).size;
  console.log(`Done! ${outputName} (${(finalSize / 1024 / 1024).toFixed(1)} MB)`);
} catch (err) {
  console.error("Extraction failed:", err.message);
  cleanup();
  process.exit(1);
}


/* Recursively find a file by name in a directory */
function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, name);
      if (found) return found;
    } else if (entry.name === name) {
      return fullPath;
    }
  }
  return null;
}


/* Clean up temporary files */
function cleanup() {
  try { fs.unlinkSync(tmpZip); } catch (_) {}
  try { fs.rmSync(path.join(binDir, "llama-extract"), { recursive: true, force: true }); } catch (_) {}
}
