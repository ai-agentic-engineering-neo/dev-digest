/* ConfigTab — the draft-over-cache form: only changed fields are sent,
   base_version rides along with a body/description change, and a 409
   stale_version keeps the draft. Runs the real hooks (useSkill, useUpdateSkill,
   useSkillDraft) against a stubbed API; CodeMirror is the setup.ts textarea. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
import { mockFetch, jsonResponse } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";
import type { Skill, UpdateSkillInput } from "@devdigest/shared";
import { useSkill } from "@/lib/hooks";
import { skillKeys } from "@/lib/hooks/keys";
import { useSkillDraft } from "../../useSkillDraft";
import { ConfigTab } from "./ConfigTab";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/** The live skill comes from the query cache, like SkillEditorView. */
function Harness() {
  const { data } = useSkill("sk1");
  return data ? <Loaded skill={data} /> : null;
}
function Loaded({ skill }: { skill: Skill }) {
  const draft = useSkillDraft(skill);
  return <ConfigTab skill={skill} draft={draft} />;
}

let live: Skill;
let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  live = makeSkill({ version: 5 });
  api = mockFetch({
    "GET /skills/sk1": () => live,
    "PUT /skills/sk1": (req) => {
      const { base_version: _b, ...patch } = req.body as UpdateSkillInput;
      const versioned = "body" in patch || "description" in patch;
      live = { ...live, ...patch, version: live.version + (versioned ? 1 : 0) };
      return live;
    },
  });
});
afterEach(cleanup);

async function renderConfig() {
  const view = renderWithProviders(<Harness />);
  await screen.findByDisplayValue("pr-quality-rubric");
  return view;
}

describe("skill ConfigTab", () => {
  it("a type-only change sends just the type (no base_version) and toasts 'Saved'", async () => {
    const { user } = await renderConfig();
    await user.selectOptions(screen.getByRole("combobox"), "security");
    await user.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(api.requests("PUT", "/skills/sk1")).toHaveLength(1));
    expect(api.requests("PUT", "/skills/sk1")[0]!.body).toEqual({ type: "security" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("a body edit shows 'unsaved' + the snapshot note and sends base_version", async () => {
    const { user } = await renderConfig();
    const body = await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });
    expect(screen.queryByText("unsaved")).toBeNull();
    await user.type(body, " More.");
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("Saving snapshots v6")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(api.requests("PUT", "/skills/sk1")).toHaveLength(1));
    expect(api.requests("PUT", "/skills/sk1")[0]!.body).toEqual({
      body: "## Rule\n\nKeep PRs focused. More.",
      base_version: 5,
    });
    expect(await screen.findByText("Saved as v6")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).toBeNull();
  });

  it("does not revert 'enabled' toggled elsewhere after the form mounted", async () => {
    const { user, queryClient } = await renderConfig();
    const name = screen.getByDisplayValue("pr-quality-rubric");
    await user.clear(name);
    await user.type(name, "pr-rubric");
    // The card's switch writes the same cache entry.
    queryClient.setQueryData<Skill>(skillKeys.detail("sk1"), (s) => (s ? { ...s, enabled: false } : s));
    await user.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(api.requests("PUT", "/skills/sk1")).toHaveLength(1));
    expect(api.requests("PUT", "/skills/sk1")[0]!.body).toEqual({ name: "pr-rubric" });
  });

  it("blocks Save on an invalid name and explains the rule", async () => {
    const { user } = await renderConfig();
    const name = screen.getByDisplayValue("pr-quality-rubric");
    await user.clear(name);
    await user.type(name, "Bad Name");
    expect(screen.getByText(/Use a kebab-case slug/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("409 stale_version: toast, keep the draft, refetch; the next save uses the new base", async () => {
    const { user } = await renderConfig();
    // Someone else saved v6 meanwhile.
    live = { ...live, version: 6, body: "Theirs" };
    api.on("PUT /skills/sk1", jsonResponse({ error: { code: "stale_version", message: "stale" } }, 409));

    const body = await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });
    await user.clear(body);
    await user.type(body, "Mine");
    await user.click(screen.getByRole("button", { name: "Save skill" }));

    expect(await screen.findByText(/Someone saved a newer version/)).toBeInTheDocument();
    expect(api.requests("PUT", "/skills/sk1")[0]!.body).toEqual({ body: "Mine", base_version: 5 });
    await waitFor(() => expect(screen.getByText("Saving snapshots v7")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Skill body" })).toHaveValue("Mine");

    api.on("PUT /skills/sk1", (req) => ({ ...live, ...(req.body as object), version: 7 }));
    await user.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(api.requests("PUT", "/skills/sk1")).toHaveLength(2));
    expect(api.requests("PUT", "/skills/sk1")[1]!.body).toEqual({ body: "Mine", base_version: 6 });
  });

  it("Cancel drops the draft", async () => {
    const { user } = await renderConfig();
    const body = await screen.findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });
    await user.type(body, "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("textbox", { name: "Skill body" })).toHaveValue(live.body);
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("shows the trust banner on an imported skill", async () => {
    live = makeSkill({ source: "imported_url", source_ref: "https://example.com/SKILL.md", enabled: false });
    await renderConfig();
    expect(screen.getByRole("note")).toHaveTextContent("Imported from https://example.com/SKILL.md");
  });
});
