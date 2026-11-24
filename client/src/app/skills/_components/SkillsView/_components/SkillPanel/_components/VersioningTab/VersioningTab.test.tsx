import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";
import type { Skill, SkillVersion } from "@devdigest/shared";

const mocks = vi.hoisted(() => ({
  versions: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  restore: vi.fn(),
  toast: { success: vi.fn() },
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => mocks.versions,
  useRestoreSkillVersion: () => ({ mutate: mocks.restore, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => mocks.toast }));

import { VersioningTab } from "./VersioningTab";

const skill = { id: "s1", name: "sk", version: 3, body: "line1\nCURRENT\nline3" } as Skill;
const ver = (version: number, body: string): SkillVersion => ({
  skill_id: "s1",
  version,
  body,
  created_at: "2026-11-20T10:00:00.000Z",
});

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersioningTab skill={skill} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.restore.mockReset();
  mocks.toast.success.mockReset();
  mocks.versions.data = [ver(3, skill.body), ver(2, "line1\nOLD\nline3"), ver(1, "line1")];
  mocks.versions.isLoading = false;
  mocks.versions.isError = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VersioningTab", () => {
  it("marks the current version and gives only earlier ones Diff and Restore", () => {
    renderTab();
    const current = within(screen.getByTestId("version-3"));
    expect(current.getByText("Current")).toBeTruthy();
    expect(current.queryByRole("button")).toBeNull();
    for (const v of [2, 1]) {
      const row = within(screen.getByTestId(`version-${v}`));
      expect(row.getByRole("button", { name: `Diff v${v} with current` })).toBeTruthy();
      expect(row.getByRole("button", { name: `Restore v${v}` })).toBeTruthy();
    }
  });

  it("Diff opens a modal with added and removed lines against the current body", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff v2 with current" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("v2 → current (v3)")).toBeTruthy();
    const lines = within(dialog).getByTestId("diff-lines");
    expect(lines.querySelector('[data-kind="del"]')?.textContent).toContain("OLD");
    expect(lines.querySelector('[data-kind="add"]')?.textContent).toContain("CURRENT");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Diff of an identical body says there are no differences", () => {
    mocks.versions.data = [ver(3, skill.body), ver(2, skill.body)];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff v2 with current" }));
    expect(screen.getByText("No differences")).toBeTruthy();
  });

  it("Restore asks for confirmation and then restores that version", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.restore.mockImplementation((_v, opts) => opts.onSuccess({ version: 4 }));
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore v1" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.restore).toHaveBeenCalledWith(1, expect.any(Object));
    expect(mocks.toast.success).toHaveBeenCalledWith("Restored v1 as v4");
  });

  it("declining the confirmation restores nothing", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore v2" }));
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("shows an empty state and an error state with retry", () => {
    mocks.versions.data = [];
    renderTab();
    expect(screen.getByText("No versions yet.")).toBeTruthy();
    cleanup();
    mocks.versions.isError = true;
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mocks.versions.refetch).toHaveBeenCalled();
  });
});
