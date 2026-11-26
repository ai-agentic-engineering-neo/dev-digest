import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { REPO_ID, fetchCalls, makeSkill, mockFetch, renderWithProviders } from "../../test-utils";
import { previewBody } from "./helpers";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }) }));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

afterEach(() => {
  cleanup();
  nav.push.mockReset();
  vi.unstubAllGlobals();
});

const DRAFT = {
  name: "payments-api-errors-conventions",
  description: "2 house conventions extracted from acme/payments-api",
  body: "# payments-api-errors-conventions\n\n## Error handling\n\n### Return Result<T, ApiError>",
  tokens: 187,
};
const DRAFT_ROUTE = `POST /repos/${REPO_ID}/conventions/skill-draft`;
const CREATE_ROUTE = `POST /repos/${REPO_ID}/conventions/skill`;

function open(onClose = vi.fn()) {
  renderWithProviders(
    <CreateSkillFromConventionsModal
      repoId={REPO_ID}
      repoName="payments-api"
      conventionIds={["c1", "c2"]}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("previewBody", () => {
  it("swaps the heading to the typed name", () => {
    expect(previewBody("# a\nbody", "b")).toBe("# b\nbody");
    expect(previewBody("no heading", "b")).toBe("no heading");
  });
});

describe("CreateSkillFromConventionsModal", () => {
  it("prefills from the draft, shows a read-only body with tokens, Enabled off; creates and opens Config", async () => {
    const created = makeSkill({ id: "sk9", name: "my-conventions" });
    const spy = mockFetch({
      [DRAFT_ROUTE]: DRAFT,
      [CREATE_ROUTE]: () => ({ status: 201, body: { skill: created } }),
      "GET /skills": [],
    });
    const onClose = open();

    expect(await screen.findByDisplayValue(DRAFT.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    expect(screen.getByText("187 tokens")).toBeInTheDocument();
    expect(screen.getByText("read-only")).toBeInTheDocument();
    // The body is a <pre>, not an editable field.
    expect(screen.getByLabelText("Skill body").tagName).toBe("PRE");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "my-conventions" } });
    expect(screen.getByLabelText("Skill body")).toHaveTextContent("# my-conventions");
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/skills/sk9?tab=config"));
    expect(onClose).toHaveBeenCalled();
    const create = fetchCalls(spy).find(([m, p]) => m === "POST" && p.endsWith("/conventions/skill"));
    expect(create?.[2]).toEqual({
      convention_ids: ["c1", "c2"],
      name: "my-conventions",
      description: DRAFT.description,
      type: "convention",
      enabled: false,
    });
  });

  it("blocks an invalid name", async () => {
    mockFetch({ [DRAFT_ROUTE]: DRAFT, "GET /skills": [] });
    open();
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Bad Name" } });
    expect(screen.getByText(/Use lowercase letters/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("on 409 says the name is taken and links to the existing skill", async () => {
    const existing = makeSkill({ id: "old1", name: DRAFT.name });
    mockFetch({
      [DRAFT_ROUTE]: DRAFT,
      [CREATE_ROUTE]: () => ({ status: 409, body: { error: { code: "conflict", message: "taken" } } }),
      "GET /skills": [existing],
    });
    const onClose = open();
    await screen.findByDisplayValue(DRAFT.name);
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`A skill named “${DRAFT.name}” already exists.`);
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/skills/old1?tab=config");
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("shows an error when the draft cannot be built", async () => {
    mockFetch({ [DRAFT_ROUTE]: () => ({ status: 400, body: { error: { message: "no" } } }), "GET /skills": [] });
    open();
    expect(await screen.findByText("Could not build the draft.")).toBeInTheDocument();
  });
});
