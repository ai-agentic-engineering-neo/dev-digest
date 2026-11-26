import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import { VersionRow } from "./VersionRow";

afterEach(cleanup);

const PREVIOUS: SkillVersion = {
  skill_id: "sk1",
  version: 3,
  body: "# Rule\nold wording",
  message: "Earlier",
  created_at: "2026-11-20T08:00:00Z",
};
const VERSION: SkillVersion = {
  skill_id: "sk1",
  version: 4,
  body: "# Rule\nnew wording",
  message: "Tightened wording",
  created_at: "2026-11-24T08:00:00Z",
};

function renderRow({
  version = VERSION,
  previous = PREVIOUS,
  isCurrent,
}: {
  version?: SkillVersion;
  /** `null` = no predecessor (an omitted value would fall back to PREVIOUS). */
  previous?: SkillVersion | null;
  isCurrent: boolean;
}) {
  const onRestore = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ul>
        <VersionRow version={version} previous={previous ?? undefined} isCurrent={isCurrent} onRestore={onRestore} />
      </ul>
    </NextIntlClientProvider>,
  );
  return { onRestore };
}

describe("VersionRow", () => {
  it("shows chip, message and date; Restore hands the version back", () => {
    const { onRestore } = renderRow({ isCurrent: false });
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("Tightened wording")).toBeInTheDocument();
    expect(screen.getByText("2026-11-24")).toBeInTheDocument();
    expect(screen.queryByText("Current")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalledWith(VERSION);
  });

  it("the current row has the Current badge and Diff, but no Restore", () => {
    renderRow({ isCurrent: true });
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("Diff expands and collapses the changes against the previous version", () => {
    renderRow({ isCurrent: true });
    const diff = screen.getByRole("button", { name: "Diff" });
    expect(diff).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    fireEvent.click(diff);
    expect(diff).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "v3 → v4" })).toBeInTheDocument();
    expect(screen.getByText("old wording").closest("[data-kind]")).toHaveAttribute("data-kind", "del");
    expect(screen.getByText("new wording").closest("[data-kind]")).toHaveAttribute("data-kind", "add");

    fireEvent.click(diff);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("the first version has nothing to diff against: no Diff button", () => {
    renderRow({ version: { ...VERSION, version: 1 }, previous: null, isCurrent: false });
    expect(screen.queryByRole("button", { name: "Diff" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("shows a dash when a version has no message", () => {
    renderRow({ version: { ...VERSION, message: "" }, isCurrent: false });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
