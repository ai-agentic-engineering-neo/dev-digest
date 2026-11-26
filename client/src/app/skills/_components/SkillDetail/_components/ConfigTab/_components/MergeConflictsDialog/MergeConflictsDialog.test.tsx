import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { ConventionMergeConflict } from "@devdigest/shared";
import { renderWithProviders } from "@/app/skills/_components/test-utils";
import { MergeConflictsDialog } from "./MergeConflictsDialog";
import { applyResolutions } from "./helpers";

afterEach(cleanup);

const A: ConventionMergeConflict = {
  convention_id: "c1",
  rule: "Name loaders getX",
  rule_block: "### Name loaders getX\n✅ `src/a.ts:1`",
  existing_excerpt: "### Name loaders loadX",
  reason: "opposite naming",
};
const B: ConventionMergeConflict = {
  convention_id: "c2",
  rule: "Throw AppError",
  rule_block: "### Throw AppError ($1 stays literal)",
  existing_excerpt: "not in the body",
  reason: "different error style",
};
const BODY = "# s\n\n## Naming\n\n### Name loaders loadX\n\n## Errors\n\n### Return Result";

describe("applyResolutions", () => {
  it("keep existing (also the default) leaves the body untouched", () => {
    expect(applyResolutions(BODY, [A, B], {})).toEqual({ body: BODY, changed: 0, appendedInstead: [] });
    expect(applyResolutions(BODY, [A], { c1: "keep_existing" }).body).toBe(BODY);
  });

  it("replace swaps the excerpt in place; a missing excerpt is appended and reported", () => {
    const res = applyResolutions(BODY, [A, B], { c1: "replace", c2: "replace" });
    expect(res.body).toBe(
      "# s\n\n## Naming\n\n### Name loaders getX\n✅ `src/a.ts:1`\n\n## Errors\n\n### Return Result\n\n### Throw AppError ($1 stays literal)\n",
    );
    expect(res).toMatchObject({ changed: 2, appendedInstead: ["Throw AppError"] });
  });

  it("replace with an empty excerpt (server dropped a long / non-unique quote) appends and reports", () => {
    const res = applyResolutions(BODY, [{ ...A, existing_excerpt: "" }], { c1: "replace" });
    expect(res.body).toBe(`${BODY}\n\n### Name loaders getX\n✅ \`src/a.ts:1\`\n`);
    expect(res).toMatchObject({ changed: 1, appendedInstead: ["Name loaders getX"] });
  });

  it("keep both appends the new rule and keeps the old text", () => {
    const res = applyResolutions(BODY, [A], { c1: "keep_both" });
    expect(res.body.startsWith(BODY)).toBe(true);
    expect(res.body.endsWith("### Name loaders getX\n✅ `src/a.ts:1`\n")).toBe(true);
    expect(res.appendedInstead).toEqual([]);
  });
});

describe("MergeConflictsDialog", () => {
  it("shows existing ↔ new + reason per conflict; Apply hands over the chosen resolutions", () => {
    const onApply = vi.fn();
    renderWithProviders(<MergeConflictsDialog conflicts={[A, B]} onApply={onApply} onDismiss={vi.fn()} />);

    expect(screen.getByText("2 merge conflicts")).toBeInTheDocument();
    const first = screen.getByRole("listitem", { name: A.rule });
    expect(within(first).getByText("opposite naming")).toBeInTheDocument();
    expect(within(first).getByText(A.existing_excerpt)).toBeInTheDocument();
    expect(within(first).getByRole("radio", { name: "Keep existing" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(first).getByRole("radio", { name: "Replace with new" }));
    expect(within(first).getByRole("radio", { name: "Replace with new" })).toHaveAttribute("aria-checked", "true");
    const second = screen.getByRole("listitem", { name: B.rule });
    fireEvent.click(within(second).getByRole("radio", { name: "Keep both" }));

    fireEvent.click(screen.getByRole("button", { name: "Apply to form" }));
    expect(onApply).toHaveBeenCalledWith({ c1: "replace", c2: "keep_both" });
  });

  it("has no X / backdrop close — conflicts are lost only through an explicit button", () => {
    const onDismiss = vi.fn();
    renderWithProviders(<MergeConflictsDialog conflicts={[A]} onApply={vi.fn()} onDismiss={onDismiss} />);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    const backdrop = screen.getByRole("dialog").previousElementSibling;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Keep all existing dismisses", () => {
    const onDismiss = vi.fn();
    renderWithProviders(<MergeConflictsDialog conflicts={[A]} onApply={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep all existing" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
