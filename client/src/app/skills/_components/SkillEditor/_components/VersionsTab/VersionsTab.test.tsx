import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 2, body: "line1\nline2\nline3", message: "tightened wording", created_at: "2026-01-02T00:00:00.000Z" },
  { skill_id: "sk1", version: 1, body: "line1\nline2", message: null, created_at: "2026-01-01T00:00:00.000Z" },
];

const mutate = vi.fn((_input: unknown, opts?: { onSuccess?: (d: { version: number }) => void }) => {
  opts?.onSuccess?.({ version: 3 });
});

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "test-coverage-nudge",
  description: "d",
  type: "custom",
  source: "manual",
  body: "line1\nline2\nline3",
  enabled: true,
  version: 2,
  token_estimate: 10,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("shows the current badge on the newest version and lists every row", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("accents the current row's chip and parks its badge where the row's actions sit", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);

    // Only the current chip is accented; every other row keeps the plain chip.
    expect((screen.getByText("v2") as HTMLElement).style.borderColor).toBe("var(--accent)");
    expect((screen.getByText("v1") as HTMLElement).style.borderColor).toBe("var(--border)");

    // The badge is the row's LAST element — where Diff/Restore sit on the
    // others — rather than the chip's immediate neighbour.
    const row = screen.getByText("v2").parentElement!;
    expect(row.lastElementChild).toContainElement(screen.getByText("Current"));
    expect(row.children[1]).not.toContainElement(screen.getByText("Current"));
  });

  it("diffs an old version against the current body", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const diffButtons = screen.getAllByText("Diff");
    fireEvent.click(diffButtons[0]!);
    expect(screen.getByText(/\+ line3/)).toBeInTheDocument();
  });

  it("restores an old version forward as a new version, never in place", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    const restoreButtons = screen.getAllByText("Restore");
    fireEvent.click(restoreButtons[0]!);

    // The client never re-sends a copy of the old body — restore-forward is
    // resolved server-side from `restore_from_version` (§5.2).
    expect(mutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { restore_from_version: 1 } },
      expect.anything(),
    );
    expect(screen.getByText("Restored as v3")).toBeInTheDocument();
  });
});
