import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { EditConventionModal } from "./EditConventionModal";
import { buildPatch, canRemove, formFrom } from "./helpers";
import { REPO_ID, fetchCalls, makeCandidate, mockFetch, renderWithProviders } from "../../test-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const C = makeCandidate();

describe("EditConventionModal helpers", () => {
  it("sends nothing when nothing changed", () => {
    expect(buildPatch(C, formFrom(C))).toBeNull();
  });

  it("puts field changes and every removal into ONE patch", () => {
    const three = makeCandidate({
      evidence: [...C.evidence!, { path: "c.ts", line_start: 1, line_end: 1, snippet: "x" }],
    });
    const form = { ...formFrom(three), rule: " New rule ", category: "naming" as const, badExample: "", removed: [2, 0] };
    expect(buildPatch(three, form)).toEqual({
      rule: "New rule",
      category: "naming",
      bad_example: null,
      remove_evidence_indices: [0, 2],
    });
  });

  it("keeps at least one evidence", () => {
    expect(canRemove(2, [], 0)).toBe(true);
    expect(canRemove(2, [0], 1)).toBe(false);
    expect(canRemove(2, [0], 0)).toBe(true);
  });
});

describe("EditConventionModal", () => {
  it("saves the edited rule and removes an evidence, then closes", async () => {
    const spy = mockFetch({ "PATCH /conventions/c1": (b) => ({ body: { ...C, ...(b as object) } }) });
    const onClose = vi.fn();
    renderWithProviders(<EditConventionModal repoId={REPO_ID} candidate={C} onClose={onClose} />);

    fireEvent.change(screen.getByDisplayValue(C.rule), { target: { value: "Always use async/await" } });
    const removes = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removes[1]!);
    // The last remaining evidence cannot be removed too.
    expect(screen.getAllByRole("button", { name: "Remove" })[0]).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchCalls(spy)).toEqual([
      ["PATCH", "/conventions/c1", { rule: "Always use async/await", remove_evidence_indices: [1] }],
    ]);
  });

  it("blocks an empty rule and stays open on a failed save", async () => {
    mockFetch({ "PATCH /conventions/c1": () => ({ status: 500, body: { error: { message: "boom" } } }) });
    const onClose = vi.fn();
    renderWithProviders(<EditConventionModal repoId={REPO_ID} candidate={C} onClose={onClose} />);

    const rule = screen.getByDisplayValue(C.rule);
    fireEvent.change(rule, { target: { value: "  " } });
    expect(screen.getByText("The rule can't be empty.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(rule, { target: { value: "Fixed rule" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
