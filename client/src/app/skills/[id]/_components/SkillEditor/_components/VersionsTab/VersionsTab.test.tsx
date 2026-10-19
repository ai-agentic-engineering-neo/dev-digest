import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skills from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const VERSIONS: SkillVersion[] = [
  { skill_id: "s1", version: 3, body: "a\nc", message: "Tightened scope", created_at: "2026-05-30T10:00:00Z" },
  { skill_id: "s1", version: 2, body: "a\nb\nx", message: null, created_at: "2026-05-09T10:00:00Z" },
  { skill_id: "s1", version: 1, body: "a\nb", message: null, created_at: "2026-03-02T10:00:00Z" },
];
const updateMutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "rubric",
  description: "Use when.",
  type: "rubric",
  source: "manual",
  body: "a\nc",
  enabled: true,
  version: 3,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("titles versions by change note, else by line delta; marks the current one", () => {
    renderTab();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getByText("Tightened scope")).toBeInTheDocument();
    expect(screen.getByText("+1 / −0 lines")).toBeInTheDocument();
    expect(screen.getByText("Initial version")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    // Only the two older versions can be diffed / restored.
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  });

  it("diffs an old version against the current body", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: "Diff" })[1]!);
    const diff = screen.getByText("v1 → v3 (current)").parentElement!;
    expect(within(diff).getByText(/- b/)).toBeInTheDocument();
    expect(within(diff).getByText(/\+ c/)).toBeInTheDocument();
  });

  it("restores by saving the old body as a new, labelled version", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]!);
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: { body: "a\nb\nx", version_message: "Restored v2" } },
      expect.anything(),
    );
  });
});
