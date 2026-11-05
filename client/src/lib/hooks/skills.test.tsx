import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "./skills";

const OLD = { id: "s1", name: "rubric", version: 5, body: "old" } as unknown as Skill;
const OTHER = { id: "s2", name: "other", version: 1, body: "x" } as unknown as Skill;
const SAVED = { ...OLD, version: 6, body: "new" } as Skill;

vi.mock("../api", () => ({ api: { put: vi.fn(async () => SAVED), del: vi.fn(async () => ({ ok: true })) } }));

function setup() {
  // staleTime: Infinity + no queryFn → invalidate cannot refetch; only setQueryData can change the cache.
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData<Skill[]>(["skills"], [OLD, OTHER]);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("useUpdateSkill", () => {
  it("writes the saved skill into the ['skills'] cache before the refetch (no stale diff → no double save)", async () => {
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useUpdateSkill(), { wrapper });

    await result.current.mutateAsync({ id: "s1", patch: { body: "new" } });

    await waitFor(() => expect(qc.getQueryData<Skill[]>(["skills"])).toEqual([SAVED, OTHER]));
  });
});

describe("useDeleteSkill", () => {
  it("removes the deleted skill from the ['skills'] cache before the refetch", async () => {
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useDeleteSkill(), { wrapper });

    await result.current.mutateAsync("s1");

    await waitFor(() => expect(qc.getQueryData<Skill[]>(["skills"])).toEqual([OTHER]));
  });
});
