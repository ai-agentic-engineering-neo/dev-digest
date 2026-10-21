import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../../../messages/en/shell.json";
import { RoleGroup } from "./RoleGroup";

const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n x\n+y" },
  { path: "src/b.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n x\n+y" },
];

function renderGroup(
  role: SmartDiffRole,
  over: { filesWithFindings?: number; hasReview?: boolean; forceOpen?: boolean } = {},
) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <RoleGroup
        role={role}
        files={FILES}
        filesWithFindings={over.filesWithFindings ?? 0}
        hasReview={over.hasReview ?? true}
        forceOpen={over.forceOpen}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("RoleGroup", () => {
  it("shows label, caption and file count; core starts expanded", () => {
    renderGroup("core");
    expect(screen.getByText("Core logic")).toBeTruthy();
    expect(screen.getByText("The substance of the change — review closely")).toBeTruthy();
    expect(screen.getByText("2 files")).toBeTruthy();
    expect(screen.getByText("src/a.ts")).toBeTruthy();
  });

  it.each(["docs", "boilerplate"] as const)("%s starts collapsed and expands on click", async (role) => {
    const user = userEvent.setup();
    renderGroup(role);
    expect(screen.queryByText("src/a.ts")).toBeNull();
    await user.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("src/a.ts")).toBeTruthy();
  });

  it("shows the files-with-findings counter", () => {
    renderGroup("core", { filesWithFindings: 2 });
    expect(screen.getByLabelText("2 files with findings").textContent).toContain("2");
  });

  it("shows 'Review not run yet' instead of counters before the first review", () => {
    renderGroup("core", { hasReview: false, filesWithFindings: 0 });
    expect(screen.getByText("Review not run yet")).toBeTruthy();
  });

  it("has a sticky header", () => {
    renderGroup("core");
    expect(screen.getByRole("button", { expanded: true }).style.position).toBe("sticky");
  });

  it("a deep link opens a collapsed group, and the group can still be collapsed by hand", async () => {
    const user = userEvent.setup();
    renderGroup("docs", { forceOpen: true });
    expect(await screen.findByText("src/a.ts")).toBeTruthy();
    await user.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("src/a.ts")).toBeNull();
  });
});
