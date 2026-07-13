/*
 * Name: use-first-run.ts
 * Purpose: Decide whether the welcome flow should greet this install.
 * Description: A frontend-only flag, kept beside the other notebooklab-* keys in
 *   localStorage, records that the welcome has been seen. It reads the flag once
 *   at mount so the greeting shows exactly on the first launch of a fresh
 *   install and never flickers back on a later reload. The backend keeps its own
 *   first-run flag for seeding the sample notebook; the two are independent.
 * Tech Stack: React 19, localStorage
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "notebooklab-welcome-seen";

export function useFirstRun() {
  /* Read once at mount. A missing flag means this is a first launch. */
  const [shouldShow, setShouldShow] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== "true",
  );

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShouldShow(false);
  }, []);

  return { shouldShow, dismiss };
}
