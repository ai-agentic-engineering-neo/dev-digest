import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const restore = vi.fn();
const VERSIONS: SkillVersion[] = [
  { version: 2, change_note: "Tightened scope rule", created_at: "2026-05-30T10:00:00Z", current: true },
  { version: 1, change_note: "Initial version", created_at: "2026-03-02T10:00:00Z", current: false },
];
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false }),
  useRestoreSkillVersion: () => ({ mutate: restore, isPending: false }),
  useSkillVersion: () => ({ data: { ...VERSIONS[1], body: "a\nold" }, isLoading: false, isError: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "r",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "a\nnew",
  enabled: true,
  version: 2,
};

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("VersionsTab", () => {
  it("lists versions newest first with notes and marks the current one", () => {
    renderTab();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("Tightened scope rule")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Restore/ })).toHaveLength(1);
  });

  it("Restore creates a new version from the old one; Diff shows changed lines", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(restore).toHaveBeenCalledWith({ id: "s1", version: 1 }, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: /Diff/ }));
    const diff = screen.getByTestId("skill-version-diff");
    expect(diff.querySelector('[data-kind="del"]')).toHaveTextContent("old");
    expect(diff.querySelector('[data-kind="add"]')).toHaveTextContent("new");
  });
});
