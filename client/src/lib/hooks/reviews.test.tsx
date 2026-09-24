import { describe, it, expect, afterEach, beforeEach } from "vitest";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { renderHookWithProviders, cleanup, act, waitFor, createTestQueryClient } from "@/test/render";
import { mockFetch, jsonResponse } from "@/test/fetch-mock";
import { FakeEventSource, installFakeEventSource } from "@/test/fake-event-source";
import { prKeys } from "./keys";
import {
  applyFindingAction,
  useCancelRun,
  useCreatePrComment,
  useDeleteReview,
  useDeleteRun,
  useFindingAction,
  useRunEvents,
  useRunReview,
} from "./reviews";

afterEach(cleanup);

const finding = (id: string): FindingRecord => ({
  id,
  severity: "WARNING",
  category: "bug",
  title: `finding ${id}`,
  file: "a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rv1",
  accepted_at: null,
  dismissed_at: null,
});

const REVIEWS: ReviewRecord[] = [
  {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 80,
    model: "gpt-4.1",
    created_at: "2026-09-01T00:00:00Z",
    findings: [finding("f1"), finding("f2")],
  },
];

/** A client pre-filled with pr1 + pr2 data, so invalidation is observable per key. */
function seededClient(): QueryClient {
  const qc = createTestQueryClient();
  for (const pr of ["pr1", "pr2"]) {
    qc.setQueryData(prKeys.detail(pr), { id: pr });
    qc.setQueryData(prKeys.activeRuns(pr), []);
    qc.setQueryData(prKeys.runs(pr), []);
    qc.setQueryData(prKeys.reviews(pr), REVIEWS);
    qc.setQueryData(prKeys.comments(pr), []);
    qc.setQueryData(prKeys.smartDiff(pr), { groups: [], split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } });
  }
  return qc;
}

const invalidated = (qc: QueryClient, key: QueryKey) => qc.getQueryState(key)?.isInvalidated ?? false;

/** Which of pr1's / pr2's run-scoped queries are invalidated. */
function runScopedState(qc: QueryClient) {
  return Object.fromEntries(
    ["pr1", "pr2"].flatMap((pr) => [
      [`${pr}.activeRuns`, invalidated(qc, prKeys.activeRuns(pr))],
      [`${pr}.runs`, invalidated(qc, prKeys.runs(pr))],
      [`${pr}.reviews`, invalidated(qc, prKeys.reviews(pr))],
      [`${pr}.smartDiff`, invalidated(qc, prKeys.smartDiff(pr))],
      [`${pr}.detail`, invalidated(qc, prKeys.detail(pr))],
    ]),
  );
}

const PR1_RUN_SCOPED_ONLY = {
  "pr1.activeRuns": true,
  "pr1.runs": true,
  "pr1.reviews": true,
  "pr1.smartDiff": true,
  "pr1.detail": false,
  "pr2.activeRuns": false,
  "pr2.runs": false,
  "pr2.reviews": false,
  "pr2.smartDiff": false,
  "pr2.detail": false,
};

describe("prKeys", () => {
  it("nests every PR-scoped key under the PR's detail key", () => {
    for (const key of [prKeys.runs("p"), prKeys.activeRuns("p"), prKeys.reviews("p"), prKeys.comments("p")]) {
      expect(key.slice(0, 2)).toEqual(prKeys.detail("p"));
    }
  });
});

describe("run mutations own their invalidation", () => {
  it("useRunReview refreshes the PR's active runs, run history and reviews", async () => {
    mockFetch({ "POST /pulls/pr1/review": { pr_id: "pr1", runs: [], reviews: [] } });
    const { result, queryClient } = renderHookWithProviders(() => useRunReview(), { queryClient: seededClient() });

    await act(() => result.current.mutateAsync({ prId: "pr1", all: true }));

    expect(runScopedState(queryClient)).toEqual(PR1_RUN_SCOPED_ONLY);
  });

  it("useCancelRun refreshes the same PR queries, also when the cancel fails", async () => {
    mockFetch({ "POST /runs/run-1/cancel": jsonResponse({ error: { message: "gone" } }, 404) });
    const { result, queryClient } = renderHookWithProviders(() => useCancelRun("pr1"), {
      queryClient: seededClient(),
    });

    await act(() => result.current.mutateAsync("run-1").catch(() => undefined));

    expect(runScopedState(queryClient)).toEqual(PR1_RUN_SCOPED_ONLY);
  });

  it("useDeleteRun refreshes the run history and reviews", async () => {
    mockFetch({ "DELETE /runs/run-1": { ok: true } });
    const { result, queryClient } = renderHookWithProviders(() => useDeleteRun("pr1"), {
      queryClient: seededClient(),
    });

    await act(() => result.current.mutateAsync("run-1"));

    expect(invalidated(queryClient, prKeys.runs("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.reviews("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.smartDiff("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.runs("pr2"))).toBe(false);
  });

  it("useDeleteReview refreshes that PR's reviews and smart-diff, not another PR's", async () => {
    mockFetch({ "DELETE /reviews/rv1": { ok: true } });
    const { result, queryClient } = renderHookWithProviders(() => useDeleteReview("pr1"), {
      queryClient: seededClient(),
    });

    await act(() => result.current.mutateAsync("rv1"));

    expect(invalidated(queryClient, prKeys.reviews("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.smartDiff("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.smartDiff("pr2"))).toBe(false);
  });

  it("useCreatePrComment refreshes only that PR's comments", async () => {
    const api = mockFetch({ "POST /pulls/pr1/comments": { id: 1 } });
    const { result, queryClient } = renderHookWithProviders(() => useCreatePrComment("pr1"), {
      queryClient: seededClient(),
    });

    await act(() => result.current.mutateAsync({ path: "a.ts", line: 3, body: "nit" }));

    expect(api.requests("POST", "/pulls/pr1/comments")[0]!.body).toEqual({ path: "a.ts", line: 3, body: "nit" });
    expect(invalidated(queryClient, prKeys.comments("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.comments("pr2"))).toBe(false);
    expect(invalidated(queryClient, prKeys.reviews("pr1"))).toBe(false);
  });
});

describe("useFindingAction", () => {
  let release: (res: Response) => void;
  beforeEach(() => {
    // Hold the action request open so the optimistic state can be inspected.
    mockFetch({
      "POST /findings/:id/:action": () => new Promise<Response>((r) => (release = r)),
    });
  });

  const cachedFinding = (qc: QueryClient, id: string) =>
    qc.getQueryData<ReviewRecord[]>(prKeys.reviews("pr1"))![0]!.findings.find((f) => f.id === id)!;

  it("marks the finding at once, then refetches the PR's reviews", async () => {
    const { result, queryClient } = renderHookWithProviders(() => useFindingAction("pr1"), {
      queryClient: seededClient(),
    });

    act(() => result.current.mutate({ findingId: "f1", action: "accept" }));

    await waitFor(() => expect(cachedFinding(queryClient, "f1").accepted_at).not.toBeNull());
    expect(cachedFinding(queryClient, "f2").accepted_at).toBeNull();
    expect(invalidated(queryClient, prKeys.reviews("pr1"))).toBe(false);

    await act(async () => release(jsonResponse({ finding: { id: "f1" } })));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated(queryClient, prKeys.reviews("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.smartDiff("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.reviews("pr2"))).toBe(false);
  });

  it("rolls the optimistic dismiss back when the request fails", async () => {
    const { result, queryClient } = renderHookWithProviders(() => useFindingAction("pr1"), {
      queryClient: seededClient(),
    });

    act(() => result.current.mutate({ findingId: "f2", action: "dismiss" }));
    await waitFor(() => expect(cachedFinding(queryClient, "f2").dismissed_at).not.toBeNull());

    await act(async () => release(jsonResponse({ error: { message: "boom" } }, 500)));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedFinding(queryClient, "f2").dismissed_at).toBeNull();
    expect(invalidated(queryClient, prKeys.reviews("pr1"))).toBe(true); // refetched anyway
  });
});

describe("applyFindingAction", () => {
  it("stamps only the acted-on finding and keeps other reviews by reference", () => {
    const other: ReviewRecord = { ...REVIEWS[0]!, id: "rv2", findings: [finding("f9")] };
    const next = applyFindingAction([REVIEWS[0]!, other], "f2", "dismiss", "T");
    expect(next[0]!.findings.map((f) => f.dismissed_at)).toEqual([null, "T"]);
    expect(next[1]).toBe(other);
  });
});

describe("useRunEvents", () => {
  beforeEach(() => {
    installFakeEventSource();
    mockFetch();
  });

  it("refreshes run-scoped PR queries once a run's stream finishes", async () => {
    const { result, queryClient } = renderHookWithProviders(() => useRunEvents(["run-1"]), {
      queryClient: seededClient(),
    });
    expect(result.current.running).toBe(true);

    await act(() =>
      FakeEventSource.for("run-1").emit("result", {
        runId: "run-1",
        seq: 1,
        kind: "result",
        msg: "Run finished",
        t: "00.10",
        data: { status: "done", error: null },
      }),
    );

    expect(result.current.running).toBe(false);
    expect(result.current.events.map((e) => e.msg)).toEqual(["Run finished"]);
    expect(invalidated(queryClient, prKeys.runs("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.activeRuns("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.reviews("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.smartDiff("pr1"))).toBe(true);
    expect(invalidated(queryClient, prKeys.comments("pr1"))).toBe(false);
    expect(invalidated(queryClient, prKeys.detail("pr1"))).toBe(false);
  });

  it("shares one stream between hooks watching the same run and closes it when the last unmounts", async () => {
    const queryClient = createTestQueryClient();
    const a = renderHookWithProviders(() => useRunEvents(["run-1"]), { queryClient });
    const b = renderHookWithProviders(() => useRunEvents(["run-1"]), { queryClient });
    expect(FakeEventSource.all("run-1")).toHaveLength(1);

    a.unmount();
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(FakeEventSource.for("run-1").readyState).toBe(FakeEventSource.OPEN);

    b.unmount();
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(FakeEventSource.for("run-1").readyState).toBe(FakeEventSource.CLOSED);
  });
});
