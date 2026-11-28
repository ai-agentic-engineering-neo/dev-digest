import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { mockApi, renderWithProviders } from "@/test/render";
import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Flag low-quality PRs",
  type: "rubric",
  source: "manual",
  body: "b2",
  enabled: true,
  version: 2,
  agent_count: 1,
};

const VERSIONS: SkillVersion[] = [
  { version: 2, name: SKILL.name, description: SKILL.description, type: "rubric", body: "b2", note: "Added Security dimension", created_at: "2026-03-22T09:00:00Z" },
  { version: 1, name: SKILL.name, description: SKILL.description, type: "rubric", body: "b1", note: "Initial rubric", created_at: "2026-03-02T09:00:00Z" },
];

function api() {
  return mockApi((method, path) => {
    if (method === "POST") return { ...SKILL, version: 3 };
    if (path === "/skills/sk1/versions") return VERSIONS;
    return SKILL;
  });
}

describe("Skill VersionsTab", () => {
  it("marks only the current version; the others get Diff and Restore", async () => {
    api();
    renderWithProviders(<VersionsTab skill={SKILL} dirty={false} onRestored={() => {}} />);
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]!).getByText("Current")).toBeInTheDocument();
    expect(within(rows[0]!).queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    expect(within(rows[1]!).queryByText("Current")).not.toBeInTheDocument();
    expect(within(rows[1]!).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(within(rows[1]!).getByText("2026-03-02")).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
  });

  it("restores only after confirming, through the restore route", async () => {
    const calls = api();
    const onRestored = vi.fn();
    renderWithProviders(<VersionsTab skill={SKILL} dirty={false} onRestored={onRestored} />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    const dialog = screen.getByRole("dialog", { name: "Restore version" });
    expect(dialog).toHaveTextContent("This creates v3 with the content of v1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "POST")?.path).toBe("/skills/sk1/versions/1/restore");
  });

  it("disables Restore while Config has unsaved edits", async () => {
    api();
    renderWithProviders(<VersionsTab skill={SKILL} dirty onRestored={() => {}} />);
    expect(await screen.findByRole("button", { name: "Restore" })).toBeDisabled();
  });
});
