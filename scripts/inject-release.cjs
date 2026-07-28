/**
 * Name: inject-release.cjs
 * Purpose: Bakes the current release tag and direct download links into the
 *   landing page before it is deployed.
 * Description: The page used to learn its version only from a browser call to
 *   api.github.com. That endpoint allows 60 requests per hour per IP for
 *   anonymous callers, so behind any shared address (an office, a campus, a
 *   mobile carrier) the call fails and the version silently disappears, while
 *   the download buttons fall back to the releases page instead of a direct
 *   file. Writing the values in at deploy time means a visitor needs no API
 *   call at all; the runtime fetch stays as a refresh for the window between a
 *   release and the next deploy. Fails the deploy rather than publishing a
 *   half-substituted page, and leaves the file untouched when nothing matched.
 * Tech Stack: Node.js, GitHub REST API
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

const fs = require("node:fs");

const REPO = process.env.GITHUB_REPOSITORY || "Amey-Thakur/NotebookLab";
const file = process.argv[2] || "site/index.html";

/* Matches the hero line whatever it currently says, so re-running is safe. */
const META_RE = /(<p class="hero-meta" id="hero-meta">)([\s\S]*?)(<\/p>)/;

function assetFor(assets, platform) {
  const pick = (re) => {
    const a = assets.find((x) => re.test(x.name));
    return a ? a.browser_download_url : null;
  };
  if (platform === "windows") return pick(/\.msi$/) || pick(/setup\.exe$/);
  if (platform === "mac") return pick(/aarch64\.dmg$/) || pick(/\.dmg$/);
  if (platform === "linux") return pick(/\.deb$/) || pick(/\.rpm$/);
  return null;
}

async function main() {
  const headers = { "user-agent": "notebooklab-site-build", accept: "application/vnd.github+json" };
  /* Authenticated in CI: 1000 requests/hour instead of the anonymous 60, and
     it is the workflow's own token, never a visitor's address. */
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
  const release = await res.json();
  const tag = release.tag_name;
  if (!tag) throw new Error("latest release has no tag_name");

  let html = fs.readFileSync(file, "utf8");

  if (!META_RE.test(html)) throw new Error(`hero-meta paragraph not found in ${file}`);
  html = html.replace(META_RE, `$1${tag} &middot; Windows, macOS, Linux$3`);

  /* Point each platform button straight at its file. A button whose asset is
     missing from this release keeps the releases page, which still works. */
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const resolved = {};
  for (const platform of ["windows", "mac", "linux"]) {
    const url = assetFor(assets, platform);
    if (!url) continue;
    const re = new RegExp(`(<a href=")[^"]*(" data-dl="${platform}")`);
    if (!re.test(html)) throw new Error(`download anchor for ${platform} not found in ${file}`);
    html = html.replace(re, `$1${url}$2`);
    resolved[platform] = url.split("/").pop();
  }

  fs.writeFileSync(file, html);
  console.log(`Baked ${tag} into ${file}`);
  for (const [platform, name] of Object.entries(resolved)) console.log(`  ${platform}: ${name}`);
  for (const platform of ["windows", "mac", "linux"]) {
    if (!resolved[platform]) console.log(`  ${platform}: no asset in ${tag}, keeping the releases page`);
  }
}

main().catch((err) => {
  console.error(`inject-release: ${err.message}`);
  /* Setting the code rather than calling process.exit lets the pending fetch
     handle close on its own; exiting mid-flight trips a libuv assertion on
     Windows and reports 127, which reads like a missing binary in CI logs. */
  process.exitCode = 1;
});
