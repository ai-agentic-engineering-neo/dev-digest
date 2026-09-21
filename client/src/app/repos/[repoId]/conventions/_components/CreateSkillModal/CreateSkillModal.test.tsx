import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { REPO_ID, bodyOf, mockFetch, renderWithProviders } from "../../_test/harness";
import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT = {
  name: "repo-conventions",
  description: "2 house conventions extracted from acme/api",
  type: "convention",
  body: "# repo-conventions\n\n## rule-a\nRule A",
  evidence_files: ["a.ts"],
  convention_ids: ["a", "b"],
};

const RESULT = {
  skill: {
    id: "s1",
    name: "repo-conventions",
    description: "d",
    type: "convention",
    source: "extracted",
    body: "x",
    enabled: true,
    version: 2,
    injection_detected: false,
    injection_matches: [],
  },
  created: false,
  agent_id: null,
  linked: false,
};

const routes = () => ({
  [`GET /repos/${REPO_ID}/conventions/skill-draft`]: DRAFT,
  "GET /agents": [{ id: "ag1", name: "General Reviewer", enabled: true }],
  [`POST /repos/${REPO_ID}/conventions/skill`]: RESULT,
});

describe("CreateSkillModal", () => {
  it("explains the creation and offers name/description, an editable body, Cancel and Create", async () => {
    mockFetch(routes());
    renderWithProviders(
      <CreateSkillModal repoId={REPO_ID} acceptedCount={2} onClose={vi.fn()} onCreated={vi.fn()} />,
    );

    expect(await screen.findByText(/Create a skill from 2 accepted conventions/)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("repo-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue(DRAFT.description);
    expect(screen.getByDisplayValue(/## rule-a/)).toBeInTheDocument(); // the body is a real field
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("posts the EDITED name, description and body (not just the draft), and reports the result", async () => {
    const fetchMock = mockFetch(routes());
    const onCreated = vi.fn();
    renderWithProviders(
      <CreateSkillModal repoId={REPO_ID} acceptedCount={2} onClose={vi.fn()} onCreated={onCreated} />,
    );
    await screen.findByDisplayValue(/## rule-a/);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  my-conventions  " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Edited description" } });
    fireEvent.change(screen.getByDisplayValue(/## rule-a/), { target: { value: "# my body" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(RESULT));
    expect(bodyOf(fetchMock, "POST", `/repos/${REPO_ID}/conventions/skill`)).toEqual({
      name: "my-conventions",
      description: "Edited description",
      type: "convention",
      body: "# my body",
      agent_id: "ag1",
    });
  });

  it("Create is disabled when the name or body is emptied", async () => {
    mockFetch(routes());
    renderWithProviders(
      <CreateSkillModal repoId={REPO_ID} acceptedCount={2} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    await screen.findByDisplayValue(/## rule-a/);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("Cancel and the X close the modal without posting", async () => {
    const fetchMock = mockFetch(routes());
    const onClose = vi.fn();
    renderWithProviders(
      <CreateSkillModal repoId={REPO_ID} acceptedCount={2} onClose={onClose} onCreated={vi.fn()} />,
    );
    await screen.findByDisplayValue(/## rule-a/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });

  it("shows an error state when no draft can be built", async () => {
    mockFetch({ "GET /agents": [] }); // draft route missing -> 404
    renderWithProviders(
      <CreateSkillModal repoId={REPO_ID} acceptedCount={0} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not build the skill draft/);
  });
});
