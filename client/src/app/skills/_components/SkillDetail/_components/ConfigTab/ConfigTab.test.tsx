import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { makeSkill } from "@/app/skills/_components/fixtures";
import { fetchCalls, mockFetch, renderWithProviders } from "@/app/skills/_components/test-utils";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ConfigTab } from "./ConfigTab";
import { buildSkillPatch, formFromSkill } from "./helpers";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

const SKILL = makeSkill();
const saveButton = () => screen.getByRole("button", { name: "Save skill" });
const bodyInput = () => screen.getByDisplayValue(/Flag any added credential/);
const putCalls = (spy: ReturnType<typeof mockFetch>) => fetchCalls(spy).filter(([m]) => m === "PUT");

function renderTab(skill: Skill = SKILL) {
  renderWithProviders(<ConfigTab skill={skill} />);
}

describe("buildSkillPatch", () => {
  it("sends only changed fields and the message only with a body change", () => {
    const form = formFromSkill(SKILL);
    expect(buildSkillPatch(form, SKILL)).toEqual({});
    expect(buildSkillPatch({ ...form, description: "New", message: "ignored" }, SKILL)).toEqual({
      description: "New",
    });
    expect(buildSkillPatch({ ...form, body: "B", message: "  Tighten " }, SKILL)).toEqual({
      body: "B",
      message: "Tighten",
    });
    expect(buildSkillPatch({ ...form, body: "B", message: "  " }, SKILL)).toEqual({ body: "B" });
  });
});

describe("ConfigTab", () => {
  it("saves a body change with its 'What changed?' message as a new version", async () => {
    const spy = mockFetch({ "PUT /skills/sk1": (patch) => ({ body: { ...SKILL, ...(patch as object), version: 3 } }) });
    renderTab();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByLabelText("What changed?")).not.toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents — changes apply to their next run")).toBeInTheDocument();

    fireEvent.change(bodyInput(), { target: { value: "# Secrets\nFlag every credential." } });
    fireEvent.change(screen.getByLabelText("What changed?"), { target: { value: "Tighten" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText("Skill saved (v3)")).toBeInTheDocument();
    expect(putCalls(spy)).toEqual([
      ["PUT", "/skills/sk1", { body: "# Secrets\nFlag every credential.", message: "Tighten" }],
    ]);
  });

  it("saves a metadata-only edit without a message or a new version; Cancel resets", async () => {
    const spy = mockFetch({ "PUT /skills/sk1": (patch) => ({ body: { ...SKILL, ...(patch as object) } }) });
    renderTab();
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Only secrets" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Description")).toHaveValue("Block diffs that add credentials");
    expect(saveButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Only secrets" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rubric" } });
    fireEvent.click(saveButton());
    expect(await screen.findByText("Skill saved")).toBeInTheDocument();
    expect(putCalls(spy)).toEqual([["PUT", "/skills/sk1", { description: "Only secrets", type: "rubric" }]]);
  });

  it("blocks invalid input and shows a 409 as an inline name error", async () => {
    mockFetch({ "PUT /skills/sk1": () => ({ status: 409, body: { error: { message: "exists" } } }) });
    renderTab();
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "" } });
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(name, { target: { value: "pr-quality-rubric" } });
    fireEvent.click(saveButton());
    expect(await screen.findByText("A skill with this name already exists.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
  });

  it("toggles enabled immediately and deletes from the danger zone", async () => {
    const spy = mockFetch({
      "PUT /skills/sk1": (patch) => ({ body: { ...SKILL, ...(patch as object) } }),
      "GET /skills/sk1/agents": [{ agent_id: "a1", agent_name: "Security Reviewer" }],
      "DELETE /skills/sk1": { ok: true },
    });
    renderTab();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(putCalls(spy)).toEqual([["PUT", "/skills/sk1", { enabled: false }]]));

    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(await screen.findByText("Used by 1 agent: Security Reviewer")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete skill" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills"));
  });
});
