import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import { renderWithProviders, mockFetch, bodyOf, SKILL_ITEM } from "../../../../../_test/harness";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { SkillConfigTab } from "./SkillConfigTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockClear();
});

const { used_by: _u, pull_rate: _p, accept_rate: _a, ...SKILL } = SKILL_ITEM;

describe("SkillConfigTab", () => {
  it("saves the edited fields and confirms the new version in a toast", async () => {
    const fetchMock = mockFetch({ "PUT /skills/s1": { ...SKILL, body: "new body", version: 3 } });
    renderWithProviders(<SkillConfigTab skill={SKILL} />);

    fireEvent.change(document.querySelector("textarea")!, { target: { value: "new body" } });
    fireEvent.click(screen.getByText("Save skill"));

    await waitFor(() =>
      expect(bodyOf(fetchMock, "PUT", "/skills/s1")).toEqual({
        name: "pr-quality-rubric",
        description: SKILL.description,
        type: "rubric",
        body: "new body",
        enabled: true,
      }),
    );
    expect(await screen.findByText("Skill saved — now at v3")).toBeInTheDocument();
  });

  it("follows an enabled flip made elsewhere so Save doesn't write the stale value back", async () => {
    const fetchMock = mockFetch({ "PUT /skills/s1": { ...SKILL, enabled: true } });
    let setSkill!: (s: typeof SKILL) => void;
    function Host() {
      const [skill, set] = React.useState({ ...SKILL, enabled: false });
      setSkill = set;
      return <SkillConfigTab skill={skill} />;
    }
    renderWithProviders(<Host />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

    // e.g. the side-panel toggle enabled it and the skill query refreshed.
    act(() => setSkill({ ...SKILL, enabled: true }));
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() => expect(bodyOf(fetchMock, "PUT", "/skills/s1")).toMatchObject({ enabled: true }));
  });

  it("shows the untrusted-source notice only for non-manual skills", () => {
    const { unmount } = renderWithProviders(<SkillConfigTab skill={SKILL} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<SkillConfigTab skill={{ ...SKILL, source: "extracted" }} />);
    expect(screen.getByRole("note")).toHaveTextContent("untrusted source");
  });

  it("deletes after confirmation and returns to the list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = mockFetch({ "DELETE /skills/s1": { ok: true } });
    renderWithProviders(<SkillConfigTab skill={SKILL} />);

    fireEvent.click(screen.getByText("Delete skill"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/skills/s1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
