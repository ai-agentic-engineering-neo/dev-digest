/* VersionsTab — history rows, inline diff against the current body, and
   Restore (confirm → POST; disabled while the editor draft is dirty). Rendered
   inside the real SkillEditor so the draft is shared across tabs. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor, within } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { makeSkill, makeVersion } from "@/test/skill-fixtures";
import type { Skill } from "@devdigest/shared";
import type { SkillTab } from "@/app/skills/constants";
import { useSkill } from "@/lib/hooks";
import { SkillEditor } from "../../SkillEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

function Harness({ initialTab }: { initialTab: SkillTab }) {
  const [tab, setTab] = React.useState<SkillTab>(initialTab);
  const { data } = useSkill("sk1");
  return data ? <SkillEditor skill={data} tab={tab} onTab={setTab} /> : null;
}

const CURRENT = "## Rule\n\nKeep PRs focused.\nNew line.";
let live: Skill;
let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  live = makeSkill({ version: 5, body: CURRENT });
  api = mockFetch({
    "GET /skills/sk1": () => live,
    "GET /skills/sk1/versions": () => [
      makeVersion({ version: 5, body: CURRENT, message: "Edited body" }),
      makeVersion({ version: 4, body: "## Rule\n\nKeep PRs small.", message: "Edited body" }),
      makeVersion({ version: 1, message: "Created" }),
    ],
    "POST /skills/sk1/versions/:v/restore": (req) => {
      live = { ...live, version: live.version + 1 };
      return { ...live, restored_from: req.params.v };
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("skill VersionsTab", () => {
  it("lists versions newest first and marks the current one", async () => {
    renderWithProviders(<Harness initialTab="versions" />);
    expect(await screen.findByText("Version history · 3 versions")).toBeInTheDocument();
    const current = screen.getByTestId("version-v5");
    expect(within(current).getByText("Current")).toBeInTheDocument();
    expect(within(current).queryByRole("button", { name: "Restore" })).toBeNull();
    expect(within(screen.getByTestId("version-v1")).getByText("Created")).toBeInTheDocument();
  });

  it("expands a row into a line diff against the current body", async () => {
    const { user } = renderWithProviders(<Harness initialTab="versions" />);
    const v4 = await screen.findByTestId("version-v4");
    await user.click(within(v4).getByRole("button", { name: "Show diff against the current version" }));
    const removed = v4.querySelectorAll('[data-kind="del"]');
    const added = v4.querySelectorAll('[data-kind="add"]');
    expect(Array.from(removed, (n) => n.textContent)).toEqual(["-Keep PRs small."]);
    expect(Array.from(added, (n) => n.textContent)).toEqual(["+Keep PRs focused.", "+New line."]);
  });

  it("Restore confirms, then POSTs the version", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderWithProviders(<Harness initialTab="versions" />);
    const v4 = await screen.findByTestId("version-v4");
    await user.click(within(v4).getByRole("button", { name: "Restore" }));
    expect(confirm).toHaveBeenCalledWith("Restore v4? It is saved as a new version.");
    await waitFor(() => expect(api.requests("POST", "/skills/sk1/versions/4/restore")).toHaveLength(1));
    expect(await screen.findByText("Restored v4 as v6")).toBeInTheDocument();
  });

  it("Restore does nothing when the confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderWithProviders(<Harness initialTab="versions" />);
    const v4 = await screen.findByTestId("version-v4");
    await user.click(within(v4).getByRole("button", { name: "Restore" }));
    expect(api.requests("POST")).toHaveLength(0);
  });

  it("Restore is disabled while the editor has unsaved changes", async () => {
    const { user } = renderWithProviders(<Harness initialTab="config" />);
    const body = await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });
    await user.type(body, " edit");
    await user.click(screen.getByRole("button", { name: /Versions/ }));
    const v4 = await screen.findByTestId("version-v4");
    expect(within(v4).getByRole("button", { name: "Restore" })).toBeDisabled();
  });

  it("Preview renders the unsaved draft under the block header", async () => {
    const { user } = renderWithProviders(<Harness initialTab="config" />);
    const body = await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });
    await user.clear(body);
    await user.type(body, "Draft **only**");
    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(screen.getByText(/### pr-quality-rubric/)).toHaveTextContent(
      "### pr-quality-rubric _Applies when:_ Flag PRs that mix refactors with behaviour changes.",
    );
    expect(screen.getByText("only").tagName).toBe("STRONG");
  });
});
