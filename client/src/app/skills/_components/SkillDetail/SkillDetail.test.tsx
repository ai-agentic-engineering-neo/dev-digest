import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { makeSkill } from "../fixtures";
import { mockFetch, renderWithProviders } from "../test-utils";
import type { SkillTab } from "../constants";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SkillDetail } from "./SkillDetail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDetail(tab: SkillTab = "config") {
  const onTab = vi.fn();
  renderWithProviders(<SkillDetail skillId="sk1" tab={tab} onTab={onTab} />);
  return onTab;
}

describe("SkillDetail", () => {
  it("shows the header and the four tabs, and reports tab changes", async () => {
    mockFetch({ "GET /skills/sk1": makeSkill({ body: "**Never** commit keys" }) });
    const onTab = renderDetail("preview");
    expect(await screen.findByRole("heading", { level: 1, name: "secret-leakage-gate" })).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    for (const name of ["Config", "Preview", "Stats", "Versions"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Never").tagName).toBe("STRONG"); // Preview tab body

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(onTab).toHaveBeenCalledWith("versions");
  });

  it("shows not-found for a 404", async () => {
    mockFetch({});
    renderDetail();
    expect(await screen.findByText("Skill not found")).toBeInTheDocument();
    expect(screen.getByText("It may have been deleted.")).toBeInTheDocument();
  });

  it("shows a load error with retry for other failures", async () => {
    const spy = mockFetch({ "GET /skills/sk1": () => ({ status: 500, body: {} }) });
    renderDetail();
    expect(await screen.findByText("Could not load this skill.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
