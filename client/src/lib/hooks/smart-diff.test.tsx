import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../query-client";
import { api } from "../api";
import { useSmartDiff } from "./smart-diff";

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: { get: vi.fn() },
}));

const get = vi.mocked(api.get);

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

describe("useSmartDiff", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("fetches the smart diff for a PR and stays idle without a prId", async () => {
    const data = {
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    };
    get.mockResolvedValue(data);

    const idle = renderHook(() => useSmartDiff(null), { wrapper });
    expect(idle.result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();

    const { result } = renderHook(() => useSmartDiff("pr1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(data));
    expect(get).toHaveBeenCalledWith("/pulls/pr1/smart-diff");
  });
});
