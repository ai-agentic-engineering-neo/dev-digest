import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor, within } from "@/test/render";
import { mockFetch, jsonResponse } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";
import type { Skill } from "@devdigest/shared";
import { useSkills } from "@/lib/hooks";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

/** Renders the card from the list cache, like SkillsView does. */
function FromList({ onOpen = () => {} }: { onOpen?: (id: string) => void }) {
  const { data } = useSkills();
  const skill = data?.[0];
  return skill ? <SkillCard skill={skill} stats={{ skill_id: skill.id, pull_rate: 0.42, accept_rate: null, findings: 3 }} onOpen={onOpen} /> : null;
}

describe("SkillCard", () => {
  it("shows name, current version, type, source, linked agents and pull % · accept %", async () => {
    mockFetch({ "GET /skills": [makeSkill({ used_by: 2, version: 7, source: "imported_file", source_ref: "rubric.zip" })] });
    renderWithProviders(<FromList />);
    expect(await screen.findByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("pull 42% · accept —")).toBeInTheDocument();
  });

  it("Delete opens the confirm modal (not the preview) and deletes on confirm", async () => {
    const api = mockFetch({
      "GET /skills": [makeSkill()],
      "GET /skills/sk1/agents": [{ id: "ag1", name: "Security Reviewer", enabled: true }],
      "DELETE /skills/sk1": { ok: true },
    });
    const onOpen = vi.fn();
    const { user } = renderWithProviders(<FromList onOpen={onOpen} />);

    await user.click(await screen.findByRole("button", { name: "Delete pr-quality-rubric" }));
    expect(onOpen).not.toHaveBeenCalled();
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText(/Delete "pr-quality-rubric"\?/)).toBeInTheDocument();
    // The modal lists the agents that lose the link.
    expect(await within(modal).findByText("Security Reviewer")).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Delete skill" }));
    await waitFor(() => expect(api.requests("DELETE", "/skills/sk1")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("Cancel closes the confirm modal without deleting", async () => {
    const api = mockFetch({
      "GET /skills": [makeSkill()],
      "GET /skills/sk1/agents": [],
      "DELETE /skills/sk1": { ok: true },
    });
    const { user } = renderWithProviders(<FromList />);
    await user.click(await screen.findByRole("button", { name: "Delete pr-quality-rubric" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.requests("DELETE")).toHaveLength(0);
  });

  it("the switch flips at once (optimistic) and sends only `enabled`", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const skill = makeSkill();
    const api = mockFetch({
      "GET /skills": [skill],
      "PUT /skills/sk1": async (req) => {
        await gate;
        return { ...skill, ...(req.body as Partial<Skill>) };
      },
    });
    const onOpen = vi.fn();
    const { user } = renderWithProviders(<FromList onOpen={onOpen} />);
    const toggle = await screen.findByRole("switch", { name: "Enable pr-quality-rubric" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(onOpen).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(api.requests("PUT", "/skills/sk1")).toHaveLength(1));
    expect(api.requests("PUT", "/skills/sk1")[0]!.body).toEqual({ enabled: false });
  });

  it("rolls the switch back when the save fails", async () => {
    mockFetch({
      "GET /skills": [makeSkill()],
      "PUT /skills/sk1": jsonResponse({ error: { code: "internal", message: "boom" } }, 500),
    });
    const { user } = renderWithProviders(<FromList />);
    const toggle = await screen.findByRole("switch");
    await user.click(toggle);
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  });

  it("clicking the card opens the preview", async () => {
    mockFetch({ "GET /skills": [makeSkill()] });
    const onOpen = vi.fn();
    const { user } = renderWithProviders(<FromList onOpen={onOpen} />);
    await user.click(await screen.findByText("pr-quality-rubric"));
    expect(onOpen).toHaveBeenCalledWith("sk1");
  });
});
