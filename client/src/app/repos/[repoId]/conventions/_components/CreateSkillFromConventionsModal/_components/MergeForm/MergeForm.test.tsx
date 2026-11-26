import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/hooks/keys";
import {
  REPO_ID,
  fetchCalls,
  makeCandidate,
  makePage,
  makeSkill,
  makeTestQueryClient,
  mockFetch,
  renderWithProviders,
} from "@/app/repos/[repoId]/conventions/test-utils";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }) }));

import { MergeForm } from "./MergeForm";

afterEach(() => {
  cleanup();
  nav.push.mockReset();
  vi.unstubAllGlobals();
});

const SKILL = makeSkill({ id: "sk2", name: "house-style", version: 4 });
const CONVENTIONS = [makeCandidate({ id: "c1" }), makeCandidate({ id: "c2", rule: "Name loaders getX" })];
const CONFLICT = {
  convention_id: "c2",
  rule: "Name loaders getX",
  rule_block: "### Name loaders getX",
  existing_excerpt: "Name loaders loadX",
  reason: "opposite naming",
};
const ROUTE = `POST /repos/${REPO_ID}/conventions/skill`;

/** Reads the merge-conflicts cache the form's mutation writes. */
let readConflicts: () => unknown = () => undefined;
function CacheProbe() {
  const qc = useQueryClient();
  readConflicts = () => qc.getQueryData(queryKeys.mergeConflicts("sk2"));
  return null;
}

function renderForm(onClose = vi.fn()) {
  renderWithProviders(
    <>
      <CacheProbe />
      <MergeForm repoId={REPO_ID} repoName="payments-api" conventions={CONVENTIONS} skill={SKILL} onClose={onClose} />
    </>,
  );
  return onClose;
}

describe("MergeForm", () => {
  it("merges into the skill, keeps conflicts in the cache and opens its Config tab", async () => {
    const merged = { ...SKILL, version: 5 };
    const spy = mockFetch({
      [ROUTE]: () => ({ status: 201, body: { skill: merged, added: 1, duplicates: 0, conflicts: [CONFLICT] } }),
    });
    const onClose = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/skills/sk2?tab=config"));
    expect(onClose).toHaveBeenCalled();
    expect(fetchCalls(spy).find(([m]) => m === "POST")?.[2]).toEqual({
      convention_ids: ["c1", "c2"],
      name: "house-style",
      target: { mode: "merge", skill_id: "sk2" },
    });
    expect(readConflicts()).toEqual([CONFLICT]);
    expect(await screen.findByText(/Merged 1 into “house-style”/)).toBeInTheDocument();
  });

  it("marks the conventions page stale, so its 'in skill' badges show without a reload", async () => {
    const qc = makeTestQueryClient();
    qc.setQueryData(queryKeys.conventions(REPO_ID), makePage(CONVENTIONS));
    mockFetch({
      [ROUTE]: () => ({ status: 201, body: { skill: SKILL, added: 1, duplicates: 1, conflicts: [] } }),
    });
    renderWithProviders(
      <MergeForm repoId={REPO_ID} repoName="payments-api" conventions={CONVENTIONS} skill={SKILL} onClose={vi.fn()} />,
      qc,
    );
    expect(qc.getQueryState(queryKeys.conventions(REPO_ID))?.isInvalidated).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    expect(qc.getQueryState(queryKeys.conventions(REPO_ID))?.isInvalidated).toBe(true);
  });

  it("stays open when the merge fails (e.g. 409 skill changed meanwhile)", async () => {
    mockFetch({ [ROUTE]: () => ({ status: 409, body: { error: { code: "conflict", message: "changed" } } }) });
    const onClose = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Merge" })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    expect(readConflicts()).toBeUndefined();
  });
});
