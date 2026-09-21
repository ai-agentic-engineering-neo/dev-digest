import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { renderWithProviders, mockFetch } from "../../../../../_test/harness";
import { SkillVersionsTab } from "./SkillVersionsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const VERSIONS = [
  { skill_id: "s1", version: 1, body: "# Old heading", created_at: "2026-01-01T10:00:00.000Z" },
  { skill_id: "s1", version: 2, body: "# New heading", created_at: "2026-02-01T10:00:00.000Z" },
];

describe("SkillVersionsTab", () => {
  it("lists versions newest first, marks the latest current, and expands a body", async () => {
    mockFetch({ "GET /skills/s1/versions": VERSIONS });
    renderWithProviders(<SkillVersionsTab skillId="s1" />);

    const rows = await screen.findAllByRole("button", { name: /Show or hide version/ });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("v2");
    expect(rows[1]).toHaveTextContent("v1");
    expect(rows[0]).toHaveTextContent("current");
    expect(rows[1]).not.toHaveTextContent("current");
    expect(screen.queryByText("Old heading")).not.toBeInTheDocument();

    fireEvent.click(rows[1]!);
    expect(await screen.findByRole("heading", { name: "Old heading" })).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(rows[1]!);
    expect(screen.queryByText("Old heading")).not.toBeInTheDocument();
  });

  it("shows a line diff against the previous version by default, and only offers it when one exists", async () => {
    mockFetch({
      "GET /skills/s1/versions": [
        { skill_id: "s1", version: 1, body: "# Rule\nkeep\nold line", created_at: "2026-01-01T10:00:00.000Z" },
        { skill_id: "s1", version: 2, body: "# Rule\nkeep\nnew line\nextra", created_at: "2026-02-01T10:00:00.000Z" },
      ],
    });
    renderWithProviders(<SkillVersionsTab skillId="s1" />);

    const rows = await screen.findAllByRole("button", { name: /Show or hide version/ });

    fireEvent.click(rows[0]!); // v2
    expect(await screen.findByText("Changes from v1")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
    const removed = document.querySelector('[data-diff="del"]');
    const added = [...document.querySelectorAll('[data-diff="add"]')];
    expect(removed).toHaveTextContent("old line");
    expect(added.map((n) => n.textContent)).toEqual([expect.stringContaining("new line"), expect.stringContaining("extra")]);
    expect(screen.getByLabelText("removed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rendered" }));
    expect(screen.queryByText("Changes from v1")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Rule" })).toBeInTheDocument();

    // v1 is the first version: nothing to diff against, so no Changes/Rendered toggle.
    fireEvent.click(rows[0]!); // collapse v2
    fireEvent.click(rows[1]!); // v1
    expect(await screen.findByRole("heading", { name: "Rule" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Changes" })).not.toBeInTheDocument();
  });
});
