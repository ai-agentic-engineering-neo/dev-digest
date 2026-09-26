import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const restoreMutate = vi.fn();
const SKILL: Skill = {
  id: "s1", name: "pr-quality-rubric", description: "", type: "rubric", source: "manual",
  body: "# Rubric\nv3", enabled: true, version: 3, evidence_files: null, agent_count: 1,
};
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({
    data: [3, 2, 1].map((version) => ({ skill_id: "s1", version, body: `v${version}`, created_at: "2026-09-26T10:00:00.000Z" })),
    isLoading: false,
  }),
  useSkillVersionDiff: (_id: string, version: number | null) => ({
    data:
      version == null
        ? undefined
        : { skill_id: "s1", from_version: version, to_version: 3, patch: `--- a\n+++ b\n@@ -1 +1 @@\n-v${version}\n+v3\n`, additions: 1, deletions: 1 },
    isLoading: false,
  }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersioningTab } from "./VersioningTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockReset();
});

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersioningTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("VersioningTab", () => {
  it("lists versions newest first, marks the current one, and offers Diff / Restore only on previous versions", () => {
    renderTab();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("v3"),
      expect.stringContaining("v2"),
      expect.stringContaining("v1"),
    ]);
    expect(within(rows[0]!).getByText("current")).toBeInTheDocument();
    expect(within(rows[0]!).queryByText("Diff")).toBeNull();
    expect(within(rows[1]!).getByText("Diff")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Restore")).toBeInTheDocument();
  });

  it("Diff shows the patch against the current version; Restore asks for confirmation then restores", () => {
    renderTab();
    const rows = screen.getAllByRole("listitem");
    fireEvent.click(within(rows[2]!).getByText("Diff"));
    expect(within(rows[2]!).getByTestId("patch-view")).toHaveTextContent("-v1");
    expect(within(rows[2]!).getByTestId("patch-view")).toHaveTextContent("+v3");
    expect(within(rows[2]!).getByText("1 added · 1 removed against v3")).toBeInTheDocument();

    fireEvent.click(within(rows[2]!).getByText("Restore"));
    expect(restoreMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Restore v1?")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Restore$/ }));
    expect(restoreMutate).toHaveBeenCalledWith({ id: "s1", version: 1 }, expect.anything());
  });
});
