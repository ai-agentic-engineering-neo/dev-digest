import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const restoreMutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({
    data: [
      {
        skill_id: "11111111-1111-4111-8111-111111111111",
        version: 2,
        body: "# Catch blocks too\nAlso flag uncovered catch paths.",
        note: null,
        created_at: "2026-09-18T12:00:00.000Z",
      },
      {
        skill_id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        body: "# Uncovered branches\nRequire an assertion per new branch.",
        note: "initial",
        created_at: "2026-09-18T11:00:00.000Z",
      },
    ] satisfies SkillVersion[],
  }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockReset();
  vi.unstubAllGlobals();
});

const SKILL: Skill = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Uncovered branches",
  description: "Flag new production paths with no asserting test.",
  type: "custom",
  source: "manual",
  body: "# Catch blocks too\nAlso flag uncovered catch paths.",
  enabled: true,
  version: 2,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("lists snapshots newest-first with a Current badge", () => {
    renderTab();
    const labels = screen.getAllByText(/^v\d+$/);
    expect(labels.map((el) => el.textContent)).toEqual(["v2", "v1"]);
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("does not offer Restore on the current version", () => {
    renderTab();
    expect(screen.getAllByText("Restore")).toHaveLength(1);
  });

  it("confirming Restore calls POST restore for the older version", () => {
    vi.stubGlobal("confirm", () => true);
    renderTab();
    fireEvent.click(screen.getByText("Restore"));
    expect(restoreMutate).toHaveBeenCalledWith({ id: SKILL.id, version: 1 });
  });

  it("Diff reveals added and removed lines vs the current body", () => {
    renderTab();
    fireEvent.click(screen.getAllByText("Diff")[1]!);
    expect(screen.getByText("# Uncovered branches")).toBeInTheDocument();
    expect(screen.getByText("# Catch blocks too")).toBeInTheDocument();
    expect(screen.getAllByText("−").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+").length).toBeGreaterThan(0);
  });
});
