import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders, mockFetch, bodyOf, SKILL_ITEM } from "../../_test/harness";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsListView } from "./SkillsListView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockClear();
});

const SECOND = {
  ...SKILL_ITEM,
  id: "s2",
  name: "no-then-chains",
  description: "House rule: async/await",
  type: "convention" as const,
  source: "extracted" as const,
  enabled: false,
  used_by: 1,
  pull_rate: null,
  accept_rate: null,
};

describe("SkillsListView", () => {
  it("renders rows with badges and the metrics line, using a dash for null rates", async () => {
    mockFetch({ "GET /skills": [SKILL_ITEM, SECOND] });
    renderWithProviders(<SkillsListView />);

    expect(await screen.findByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("71% pull")).toBeInTheDocument();
    expect(screen.getByText("74% accept")).toBeInTheDocument();
    expect(screen.getByText("Manual · v2")).toBeInTheDocument();

    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(screen.getByText("— pull")).toBeInTheDocument();
    expect(screen.getByText("— accept")).toBeInTheDocument();
    expect(screen.getByText("Imported · v2")).toBeInTheDocument();
    expect(screen.getAllByText("needs vetting")).toHaveLength(1); // non-manual only
  });

  it("toggling a row's switch PUTs the enabled flag without navigating", async () => {
    const fetchMock = mockFetch({
      "GET /skills": [SKILL_ITEM],
      "PUT /skills/s1": { ...SKILL_ITEM, enabled: false },
    });
    renderWithProviders(<SkillsListView />);
    await screen.findByText("pr-quality-rubric");

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/skills/s1")).toEqual({ enabled: false }));
    expect(push).not.toHaveBeenCalled();
  });

  it("filters by search and navigates to the editor on row click", async () => {
    mockFetch({ "GET /skills": [SKILL_ITEM, SECOND] });
    renderWithProviders(<SkillsListView />);
    await screen.findByText("pr-quality-rubric");

    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "async" } });
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("no-then-chains"));
    expect(push).toHaveBeenCalledWith("/skills/s2?tab=config");
  });

  it("shows the empty state when there are no skills", async () => {
    mockFetch({ "GET /skills": [] });
    renderWithProviders(<SkillsListView />);
    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
  });
});
