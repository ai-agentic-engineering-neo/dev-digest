import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { useUploadQueue } from "./useUploadQueue";

const mutateAsync = vi.fn();

vi.mock("@/lib/hooks/devdigest-docs", () => ({
  useUploadDevdigestDoc: () => ({ mutateAsync }),
}));

vi.mock("@/lib/devdigest-docs", async (orig) => ({
  ...(await orig<typeof import("@/lib/devdigest-docs")>()),
  fileToBase64: vi.fn(async () => "eA=="),
}));

const md = (name: string) => new File(["x"], name, { type: "text/markdown" });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useUploadQueue", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  it("a new upload supersedes a running batch: the old batch stops and never writes into the new report", async () => {
    const slowA = deferred<{ path: string }>();
    mutateAsync.mockImplementation(({ filename }: { filename: string }) =>
      filename === "a.md" ? slowA.promise : Promise.resolve({ path: `.devdigest/specs/${filename}` }),
    );
    const { result } = renderHook(() => useUploadQueue("r1", ""));

    act(() => result.current.start([md("a.md"), md("b.md")]));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1)); // a.md in flight

    act(() => result.current.start([md("c.md")]));
    await waitFor(() => expect(result.current.report.added).toEqual([".devdigest/specs/c.md"]));

    await act(async () => {
      slowA.resolve({ path: ".devdigest/specs/a.md" });
      await slowA.promise;
    });

    expect(result.current.report.added).toEqual([".devdigest/specs/c.md"]);
    const uploaded = mutateAsync.mock.calls.map(([v]) => (v as { filename: string }).filename);
    expect(uploaded).not.toContain("b.md"); // the old batch stopped before its next file
  });

  it("a conflict of a superseded batch does not land in the new report", async () => {
    const slowA = deferred<{ path: string }>();
    mutateAsync.mockImplementation(({ filename }: { filename: string }) =>
      filename === "a.md" ? slowA.promise : Promise.resolve({ path: `.devdigest/specs/${filename}` }),
    );
    const { result } = renderHook(() => useUploadQueue("r1", ""));

    act(() => result.current.start([md("a.md")]));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    act(() => result.current.start([md("c.md")]));
    await waitFor(() => expect(result.current.report.added).toEqual([".devdigest/specs/c.md"]));

    await act(async () => {
      slowA.reject(new ApiError("exists", 409, "conflict", { reason: "exists" }));
      await slowA.promise.catch(() => undefined);
    });

    expect(result.current.report.conflicts).toEqual([]);
    expect(result.current.report.rejected).toEqual([]);
  });
});
