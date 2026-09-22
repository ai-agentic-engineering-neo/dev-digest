import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
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
  it("shows name, type, source, linked agents and pull % · accept %", async () => {
    mockFetch({ "GET /skills": [makeSkill({ used_by: 2, source: "imported_file", source_ref: "rubric.zip" })] });
    renderWithProviders(<FromList />);
    expect(await screen.findByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("pull 42% · accept —")).toBeInTheDocument();
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
