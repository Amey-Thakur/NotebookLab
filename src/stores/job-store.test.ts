/*
 * Name: job-store.test.ts
 * Purpose: Pin the behaviour every feature now depends on.
 * Description: The job store is what makes a generation survive leaving its
 *   page, and the status bar reads its selectors to say what is running. Both
 *   are easy to break silently: an ordering change or a status filter that
 *   drifts shows the wrong work, or none, with nothing failing.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { countRunning, selectJobs, useJobStore, type Job } from "./job-store";

vi.mock("@/services/tauri-client", () => ({
  tauriInvoke: vi.fn(() => Promise.reject(new Error("no backend in tests"))),
}));

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    kind: "studio",
    notebook_id: "nb-1",
    label: "Study guide",
    status: "running",
    phase: "Generating",
    percent: 40,
    eta_seconds: 30,
    result: null,
    error: null,
    elapsed_ms: 1000,
    ...overrides,
  };
}

describe("job store", () => {
  beforeEach(() => {
    useJobStore.setState({ jobs: {}, ready: false });
  });

  it("keeps a job by id", () => {
    useJobStore.getState().upsert(job());
    expect(useJobStore.getState().jobs["job-1"].percent).toBe(40);
  });

  it("replaces a job as it progresses rather than accumulating", () => {
    const { upsert } = useJobStore.getState();
    upsert(job({ percent: 40 }));
    upsert(job({ percent: 90, phase: "Finishing up" }));
    expect(Object.keys(useJobStore.getState().jobs)).toHaveLength(1);
    expect(useJobStore.getState().jobs["job-1"].percent).toBe(90);
  });

  it("keeps a finished job, so a page can rejoin its result", () => {
    /* The whole point: the answer has to still be there when the user comes
       back to the page that asked for it. */
    const { upsert } = useJobStore.getState();
    upsert(job());
    upsert(job({ status: "done", percent: 100, result: "the guide" }));
    expect(useJobStore.getState().jobs["job-1"].result).toBe("the guide");
  });

  it("marks itself ready even when there is no backend to ask", async () => {
    /* Outside the desktop app the invoke rejects. Staying "not ready" forever
       would leave every page showing a loading state that never resolves. */
    await useJobStore.getState().hydrate();
    expect(useJobStore.getState().ready).toBe(true);
  });
});

describe("countRunning", () => {
  it("counts only what is still working", () => {
    const jobs = {
      a: job({ id: "a", status: "running" }),
      b: job({ id: "b", status: "done" }),
      c: job({ id: "c", status: "failed" }),
      d: job({ id: "d", status: "cancelled" }),
      e: job({ id: "e", status: "running" }),
    };
    expect(countRunning(jobs)).toBe(2);
  });

  it("is zero for an empty store", () => {
    expect(countRunning({})).toBe(0);
  });
});

describe("selectJobs", () => {
  it("orders newest first", () => {
    /* Elapsed time counts up, so the newest job is the one with the least of
       it. Sorting the other way would bury the job just started. */
    const jobs = {
      old: job({ id: "old", elapsed_ms: 90_000 }),
      recent: job({ id: "recent", elapsed_ms: 500 }),
    };
    expect(selectJobs(jobs).map((j) => j.id)).toEqual(["recent", "old"]);
  });

  it("filters to one notebook when asked", () => {
    const jobs = {
      mine: job({ id: "mine", notebook_id: "nb-1" }),
      other: job({ id: "other", notebook_id: "nb-2" }),
    };
    expect(selectJobs(jobs, "nb-1").map((j) => j.id)).toEqual(["mine"]);
    expect(selectJobs(jobs)).toHaveLength(2);
  });
});
