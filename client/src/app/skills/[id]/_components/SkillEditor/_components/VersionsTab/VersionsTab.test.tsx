import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const restoreMutate = vi.fn();
const versionsState = {
  data: [] as SkillVersion[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => versionsState,
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));

import { VersionsTab } from "./VersionsTab";

const version = (v: number, body: string): SkillVersion => ({
  skill_id: "s1",
  version: v,
  body,
  created_at: "2026-09-22T10:00:00.000Z",
});

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "line one\nline three",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <VersionsTab skill={SKILL} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  restoreMutate.mockClear();
  versionsState.data = [
    version(1, "line one\nline two"),
    version(2, "line one\nline three"),
  ];
});
afterEach(() => {
  cleanup();
  // Several tests spy on window.confirm; restoring only in afterEach (rather
  // than inline in each test) means a failed assertion can never leave a
  // stubbed confirm() bleeding into a later test.
  vi.restoreAllMocks();
});

describe("VersionsTab", () => {
  it("lists versions newest-first and marks the current one", () => {
    renderTab();
    const cards = screen.getAllByRole("group");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Version 2", "Version 1"]);
    expect(within(cards[0]!).getByText("current")).toBeInTheDocument();
    expect(within(cards[1]!).queryByText("current")).not.toBeInTheDocument();
  });

  it("shows the diff against the PREVIOUS version on demand", () => {
    renderTab();
    expect(screen.queryByText(/Changes from/)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Diff/ })[0]!);

    expect(screen.getByText("Changes from v1 to v2")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument(); // removed
    expect(screen.getByText("line three")).toBeInTheDocument(); // added
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
  });

  it("collapses the diff when toggled again", () => {
    renderTab();
    const btn = () => screen.getAllByRole("button", { name: /Diff/ })[0]!;
    fireEvent.click(btn());
    expect(screen.getByText("Changes from v1 to v2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Hide diff/ }));
    expect(screen.queryByText("Changes from v1 to v2")).not.toBeInTheDocument();
  });

  it("disables Diff on the oldest version, which has nothing to compare against", () => {
    renderTab();
    const oldest = screen.getByRole("group", { name: "Version 1" });
    expect(within(oldest).getByRole("button", { name: /Diff/ })).toBeDisabled();
    const newest = screen.getByRole("group", { name: "Version 2" });
    expect(within(newest).getByRole("button", { name: /Diff/ })).toBeEnabled();
  });

  it("does NOT restore when the confirmation is declined", () => {
    // Restore permanently deletes newer versions — declining must be a full no-op.
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();

    const oldest = screen.getByRole("group", { name: "Version 1" });
    fireEvent.click(within(oldest).getByRole("button", { name: /Restore/ }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]![0]).toContain("1");
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("restores the chosen version once confirmed", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderTab();

    const oldest = screen.getByRole("group", { name: "Version 1" });
    fireEvent.click(within(oldest).getByRole("button", { name: /Restore/ }));

    expect(restoreMutate).toHaveBeenCalledTimes(1);
    expect(restoreMutate.mock.calls[0]![0]).toEqual({ id: "s1", version: 1 });
  });

  it("cannot restore the version that is already current", () => {
    renderTab();
    const newest = screen.getByRole("group", { name: "Version 2" });
    expect(within(newest).getByRole("button", { name: /Restore/ })).toBeDisabled();
  });
});
