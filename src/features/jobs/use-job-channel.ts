/*
 * Name: use-job-channel.ts
 * Purpose: Keep the job store fed, for the whole life of the app.
 * Description: Mounted once in the shell, above the router, so it is never
 *   unmounted by navigation. That placement is the point: a subscription that
 *   lived on a feature page would be torn down exactly when the user switched
 *   away, which is the moment a running generation most needs someone
 *   listening.
 *
 *   On mount it also asks the backend what it is already holding, so a window
 *   reload rejoins jobs that are still running rather than losing sight of them.
 * Tech Stack: React 19, Tauri events
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { useEffect } from "react";

import { JOB_EVENT, useJobStore, type Job } from "@/stores/job-store";

export function useJobChannel() {
  useEffect(() => {
    const { hydrate, upsert } = useJobStore.getState();
    void hydrate();

    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      /* Outside the desktop app there are no jobs to hear about. */
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        const stop = await listen<Job>(JOB_EVENT, (event) => upsert(event.payload));
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        /* No event bridge: the store still holds whatever hydrate found, so a
           finished job is visible even though live progress is not. */
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
