/*
 * Name: page-loader.tsx
 * Purpose: The moment-of-loading state while a lazy page's code arrives.
 * Description: A single pulsing accent mark, centered: the same quiet signal
 *   as the boot screen in index.html, so every loading moment in the app
 *   speaks one visual language. Under reduced motion it stands still. Split
 *   pages load from local disk in tens of milliseconds, so this flashes at
 *   most briefly; its job is making that instant feel deliberate instead of
 *   broken.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

export function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center" aria-label="Loading" role="status">
      <div
        aria-hidden="true"
        className="h-3.5 w-3.5 bg-accent animate-pulse motion-reduce:animate-none motion-reduce:opacity-70"
      />
    </div>
  );
}
