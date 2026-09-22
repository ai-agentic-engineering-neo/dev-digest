/* ConventionsView — empty state + extraction, the rule list, accept / reject
   PATCHes, inline edit, dropped report and the create-skill modal payload,
   with the real hooks over a stubbed API. AppShell is a passthrough. */
import type React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import type { Agent } from "@devdigest/shared";
import { renderWithProviders, screen, cleanup, within, waitFor } from "@/test/render";
import { jsonResponse, mockFetch } from "@/test/fetch-mock";
import { makeConvention, makeScan, makeState } from "@/test/convention-fixtures";
import { makeSkill } from "@/test/skill-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ConventionsView } from "./ConventionsView";

const REPO = {
  id: "r1",
  workspace_id: "w1",
  owner: "acme",
  name: "payments-api",
  full_name: "acme/payments-api",
  default_branch: "main",
  clone_path: "/clones/acme/payments-api",
  last_polled_at: null,
  created_by: null,
};

const AGENT: Agent = {
  id: "ag1",
  name: "General Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  enabled: true,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

const ASYNC = makeConvention({ id: "cv1", status: "accepted" });
const RESULT = makeConvention({
  id: "cv2",
  category: "api",
  rule: "All public route handlers return typed Result<T, ApiError>",
  confidence: 0.78,
  evidence: [
    { path: "src/api/public/index.ts", start_line: 14, end_line: 16, snippet: "function handler(): Result<Item[], ApiError> {" },
    { path: "src/api/public/orders.ts", start_line: 8, end_line: 8, snippet: "function list(): Result<Order[], ApiError> {" },
  ],
});

/** Stubbed API whose GET reflects every PATCH (like the server would). */
function setup(state = makeState({ conventions: [ASYNC, RESULT] })) {
  let conventions = state.conventions;
  return mockFetch({
    "GET /repos": [REPO],
    "GET /skills": [],
    "GET /agents": [AGENT],
    "GET /repos/r1/conventions": () => ({ ...state, conventions }),
    "PATCH /conventions/:id": (req) => {
      conventions = conventions.map((c) => (c.id === req.params.id ? { ...c, ...(req.body as object) } : c));
      return conventions.find((c) => c.id === req.params.id);
    },
  });
}

const card = (rule: string) => screen.getByRole("article", { name: rule });

beforeEach(() => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn() } });
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("empty repo: shows the empty state and Run extraction posts the extract", async () => {
    const api = setup(makeState({ scan: null, conventions: [] }));
    api.on("POST /repos/r1/conventions/extract", jsonResponse(makeScan({ status: "running", sampled_files: [] }), 202));
    const { user } = renderWithProviders(<ConventionsView repoId="r1" />);

    expect(await screen.findByText("No conventions extracted yet")).toBeInTheDocument();
    api.on("GET /repos/r1/conventions", makeState({ scan: makeScan({ status: "running", sampled_files: [] }) }));
    await user.click(screen.getByRole("button", { name: "Run extraction" }));

    await waitFor(() => expect(api.requests("POST", "/repos/r1/conventions/extract")).toHaveLength(1));
    expect(await screen.findByText("Scanning the repo…")).toBeInTheDocument();
  });

  it("lists the rules with evidence, confidence and counts", async () => {
    setup(
      makeState({
        scan: makeScan({ dropped: [{ rule: "Use tabs", path: "src/nope.ts", reason: "file_not_found" }] }),
        conventions: [ASYNC, RESULT],
      }),
    );
    const { user } = renderWithProviders(<ConventionsView repoId="r1" />);

    expect(await screen.findByText("payments-api")).toBeInTheDocument();
    expect(screen.getByText(/Detected from 3 sample files · last scan/)).toBeInTheDocument();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();

    const result = card(RESULT.rule);
    expect(within(result).getByText("src/api/public/index.ts:14-16")).toBeInTheDocument();
    expect(within(result).getByRole("meter", { name: "Confidence" })).toHaveAttribute("aria-valuenow", "78");
    expect(within(result).queryByText("src/api/public/orders.ts:8")).toBeNull();
    await user.click(within(result).getByRole("button", { name: "+1 more place" }));
    expect(within(result).getByText("src/api/public/orders.ts:8")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /1 candidate dropped/ }));
    expect(screen.getByText("file not found")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Pending/ }));
    expect(screen.getAllByTestId("convention-card")).toHaveLength(1);
  });

  it("Accept sends PATCH status=accepted and updates the card at once; clicking it again resets to pending", async () => {
    const api = setup();
    const { user } = renderWithProviders(<ConventionsView repoId="r1" />);
    await screen.findByText(RESULT.rule);

    await user.click(within(card(RESULT.rule)).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(card(RESULT.rule)).toHaveAttribute("data-status", "accepted"));
    await waitFor(() => expect(api.requests("PATCH", "/conventions/cv2")).toHaveLength(1));
    expect(api.requests("PATCH", "/conventions/cv2")[0]!.body).toEqual({ status: "accepted" });

    await user.click(within(card(ASYNC.rule)).getByRole("button", { name: "Accepted" }));
    await waitFor(() => expect(api.requests("PATCH", "/conventions/cv1")[0]!.body).toEqual({ status: "pending" }));
  });

  it("Reject and inline edit send their patches", async () => {
    const api = setup();
    const { user } = renderWithProviders(<ConventionsView repoId="r1" />);
    await screen.findByText(RESULT.rule);

    await user.click(within(card(RESULT.rule)).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(api.requests("PATCH", "/conventions/cv2")[0]!.body).toEqual({ status: "rejected" }));

    const asyncCard = card(ASYNC.rule);
    await user.click(within(asyncCard).getByRole("button", { name: "Edit rule" }));
    const box = within(asyncCard).getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Prefer await over .then()");
    await user.selectOptions(within(asyncCard).getByRole("combobox"), "style");
    await user.click(within(asyncCard).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.requests("PATCH", "/conventions/cv1")[0]!.body).toEqual({ rule: "Prefer await over .then()", category: "style" }),
    );
  });

  it("Create skill is disabled without accepted rules", async () => {
    setup(makeState({ conventions: [RESULT] }));
    renderWithProviders(<ConventionsView repoId="r1" />);
    await screen.findByText(RESULT.rule);
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("Create skill opens the draft and posts the edited values with the linked agents", async () => {
    const accepted2 = makeConvention({ ...RESULT, status: "accepted" });
    const api = setup(makeState({ conventions: [ASYNC, accepted2] }));
    api.on(
      "POST /repos/r1/conventions/skill",
      jsonResponse(
        { skill: makeSkill({ id: "sk9", name: "payments-house-rules", source: "extracted" }), linked_agents: [{ id: "ag1", name: "General Reviewer", enabled: true }] },
        201,
      ),
    );
    const { user } = renderWithProviders(<ConventionsView repoId="r1" />);
    await screen.findByText(ASYNC.rule);

    await user.click(screen.getByRole("button", { name: "Create skill" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/2 accepted conventions/)).toBeInTheDocument();
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("payments-api-conventions");
    expect(within(dialog).getByRole("textbox", { name: "Description" })).toHaveValue(
      "2 house conventions extracted from payments-api",
    );

    // The draft body follows the name until it is edited by hand.
    await user.clear(name);
    await user.type(name, "payments-house-rules");
    const body = await within(dialog).findByRole("textbox", { name: "Skill body" }, { timeout: 5000 });
    expect((body as HTMLTextAreaElement).value).toMatch(/^# payments-house-rules\n/);
    expect((body as HTMLTextAreaElement).value).toContain("Detected in `src/api/public/index.ts:14-16`:");
    expect(within(dialog).getByText("payments-house-rules.md")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("switch"));
    await user.click(within(dialog).getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(api.requests("POST", "/repos/r1/conventions/skill")).toHaveLength(1));
    const sent = api.requests("POST", "/repos/r1/conventions/skill")[0]!.body as Record<string, unknown>;
    expect(sent).toMatchObject({
      convention_ids: ["cv1", "cv2"],
      name: "payments-house-rules",
      description: "2 house conventions extracted from payments-api",
      type: "convention",
      enabled: false,
      agent_ids: ["ag1"],
    });
    expect(sent.body).toBe((body as HTMLTextAreaElement).value);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Skill payments-house-rules created and linked to 1 agent")).toBeInTheDocument();
  });

  it("a duplicate skill name shows the conflict inline and keeps the modal open", async () => {
    const api = setup(makeState({ conventions: [ASYNC] }));
    api.on(
      "POST /repos/r1/conventions/skill",
      jsonResponse({ error: { code: "conflict", message: "Skill name already exists" } }, 409),
    );
    const { user } = renderWithProviders(<ConventionsView repoId="r1" />);
    await screen.findByText(ASYNC.rule);
    await user.click(screen.getByRole("button", { name: "Create skill" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Create skill" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("A skill with this name already exists");
  });
});
