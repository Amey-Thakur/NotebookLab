/*
 * Name: external-link.ts
 * Purpose: Open external URLs from inside the app reliably.
 * Description: A Tauri webview blocks plain anchor navigation to external
 *   origins, so http(s) links do nothing unless routed through the shell
 *   plugin. openExternal opens the URL in the system browser when running
 *   under Tauri, and falls back to window.open in a plain browser (dev
 *   preview and tests). bindExternalLinks installs one delegated click
 *   handler that intercepts clicks on external http(s) links anywhere in the
 *   app and routes them through openExternal, so every current and future
 *   external link works without wiring each one by hand. Local and in-app
 *   links (relative URLs, bundled assets, react-router navigation) are left
 *   untouched.
 * Tech Stack: Tauri v2, TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { isTauri } from "@tauri-apps/api/core";

/** Open an external URL in the system browser, or a new tab outside Tauri. */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch {
      /* fall through to the browser path below */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Install a single delegated click handler that sends external http(s) links
 * through openExternal. Returns a cleanup function. Anchors that opt out with
 * `data-inapp` (or a `download`) are left to the browser/webview to handle.
 */
export function bindExternalLinks(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as HTMLElement | null)?.closest?.("a");
    if (!anchor) return;
    if (anchor.hasAttribute("download") || anchor.dataset.inapp !== undefined) return;

    const href = anchor.getAttribute("href");
    if (!href || !/^https?:\/\//i.test(href)) return;

    event.preventDefault();
    void openExternal(href);
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
