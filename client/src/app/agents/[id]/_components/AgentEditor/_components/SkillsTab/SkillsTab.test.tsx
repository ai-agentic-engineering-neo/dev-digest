/* Agent Editor → Skills tab: linked skills first in link order, checkbox
   toggles and a keyboard drag each send ONE POST with the full ordered list.
   dnd-kit measures rows with getBoundingClientRect, which jsdom answers with
   zeros, so the rows get a stacked layout below. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor, within, act } from "@/test/render";
import { mockFetch, jsonResponse } from "@/test/fetch-mock";
import { AGENT, makeSkill } from "@/test/skill-fixtures";
import type { AgentSkillLink } from "@devdigest/shared";
import { SkillsTab } from "./SkillsTab";

const ROW_HEIGHT = 40;

/** Stack every skill row vertically so dnd-kit's keyboard sensor can find neighbours. */
function stubRowLayout() {
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const row = this.closest("[data-testid='agent-skill-row']");
    if (!row) return original.call(this);
    const index = Array.from(document.querySelectorAll("[data-testid='agent-skill-row']")).indexOf(row);
    const top = index * ROW_HEIGHT;
    return { x: 0, y: top, top, left: 0, width: 600, height: ROW_HEIGHT, right: 600, bottom: top + ROW_HEIGHT, toJSON: () => ({}) } as DOMRect;
  });
}

const SKILLS = [
  makeSkill({ id: "s-a", name: "alpha-rule" }),
  makeSkill({ id: "s-b", name: "bravo-rule", enabled: false }),
  makeSkill({ id: "s-c", name: "charlie-rule" }),
  makeSkill({ id: "s-d", name: "delta-rule", description: "Flag N+1 queries" }),
];

const links = (ids: string[]): AgentSkillLink[] => ids.map((skill_id, order) => ({ agent_id: "ag1", skill_id, order }));

let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  stubRowLayout();
  api = mockFetch({
    "GET /skills": SKILLS,
    // Server order is by `order`, not by array position.
    "GET /agents/ag1/skills": [
      { agent_id: "ag1", skill_id: "s-a", order: 1 },
      { agent_id: "ag1", skill_id: "s-c", order: 0 },
    ],
    "POST /agents/ag1/skills": (req) => links((req.body as { skill_ids: string[] }).skill_ids),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Skill names of the rows, top to bottom. */
const rowNames = () =>
  screen.getAllByTestId("agent-skill-row").map((r) => SKILLS.find((sk) => sk.id === r.dataset.skillId)?.name);
const posted = () => api.requests("POST", "/agents/ag1/skills").map((r) => (r.body as { skill_ids: string[] }).skill_ids);

describe("Agent Editor SkillsTab", () => {
  it("lists linked skills first in link order, then the rest by name; counts linked of total", async () => {
    renderWithProviders(<SkillsTab agent={AGENT} />);
    expect(await screen.findByText("2 of 4 enabled")).toBeInTheDocument();
    expect(rowNames()).toEqual(["charlie-rule", "alpha-rule", "bravo-rule", "delta-rule"]);
    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-checked"))).toEqual([
      "true",
      "true",
      "false",
      "false",
    ]);
    // Globally disabled skill keeps its row, with a hint.
    expect(within(screen.getAllByTestId("agent-skill-row")[2]!).getByText("disabled")).toBeInTheDocument();
  });

  it("checking a skill appends it; unchecking removes it — one POST each", async () => {
    const { user } = renderWithProviders(<SkillsTab agent={AGENT} />);
    await user.click(await screen.findByRole("checkbox", { name: "delta-rule" }));
    await waitFor(() => expect(posted()).toEqual([["s-c", "s-a", "s-d"]]));
    expect(await screen.findByText("3 of 4 enabled")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "charlie-rule" }));
    await waitFor(() => expect(posted()).toHaveLength(2));
    expect(posted()[1]).toEqual(["s-a", "s-d"]);
  });

  it("keyboard drag (Space, ArrowUp ×2, Space) moves the 3rd linked skill to the top", async () => {
    const { user } = renderWithProviders(<SkillsTab agent={AGENT} />);
    await user.click(await screen.findByRole("checkbox", { name: "delta-rule" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await screen.findByText("3 of 4 enabled");

    const handle = screen.getByRole("button", { name: "Drag to reorder delta-rule" });
    act(() => handle.focus());
    await user.keyboard(" ");
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{ArrowUp}");
    await user.keyboard(" ");

    await waitFor(() => expect(posted()).toHaveLength(2));
    expect(posted()[1]).toEqual(["s-d", "s-c", "s-a"]);
    await waitFor(() => expect(rowNames().slice(0, 3)).toEqual(["delta-rule", "charlie-rule", "alpha-rule"]));
  });

  it("filtering hides non-matching rows and disables dragging", async () => {
    const { user } = renderWithProviders(<SkillsTab agent={AGENT} />);
    await screen.findByText("2 of 4 enabled");
    await user.type(screen.getByRole("textbox", { name: "Filter skills…" }), "rule");
    expect(screen.getByText("Clear the filter to reorder.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drag to reorder charlie-rule" })).toBeDisabled();
    await user.clear(screen.getByRole("textbox", { name: "Filter skills…" }));
    await user.type(screen.getByRole("textbox", { name: "Filter skills…" }), "n+1");
    expect(rowNames()).toEqual(["delta-rule"]);
  });

  it("rolls back when the server rejects the change", async () => {
    api.on("POST /agents/ag1/skills", jsonResponse({ error: { code: "unknown_skill", message: "no" } }, 422));
    const { user } = renderWithProviders(<SkillsTab agent={AGENT} />);
    await user.click(await screen.findByRole("checkbox", { name: "delta-rule" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "delta-rule" })).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
  });
});
