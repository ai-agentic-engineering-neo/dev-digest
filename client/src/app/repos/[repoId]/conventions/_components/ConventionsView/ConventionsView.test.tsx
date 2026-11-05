import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { Convention } from "@/lib/types";
import type { ConventionsSkillDraft } from "@/lib/types";
import conventionsMessages from "../../../../../../../messages/en/conventions.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

/* Conventions page: list + accept/reject/edit + Create skill modal. Hooks,
   AppShell and repo context are mocked — no network / query client. */

const updateMutate = vi.fn();
const setAllMutate = vi.fn();
const extractMutate = vi.fn();
const createMutateAsync = vi.fn();
let list: Convention[] = [];
let draft: ConventionsSkillDraft | undefined;

vi.mock("../../../../../../lib/hooks/conventions", () => ({
  useConventions: () => ({ data: list, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false }),
  useUpdateConvention: () => ({ mutate: updateMutate }),
  useSetAllConventions: () => ({ mutate: setAllMutate }),
  useConventionsSkillDraft: () => ({ data: draft, isError: false, refetch: vi.fn() }),
  useCreateConventionsSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

const AGENTS = [{ id: "ag-api", name: "API Contract Reviewer" }] as Agent[];
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: AGENTS }),
}));

vi.mock("../../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", name: "payments-api", full_name: "acme/payments-api" }] }),
  useRepoNotFound: () => false,
}));

import { ConventionsView } from "./ConventionsView";
import { confidenceColor, evidenceRef, nextStatusOnAccept, nextStatusOnReject } from "./helpers";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  list = [];
  draft = undefined;
});

const conv = (over: Partial<Convention>): Convention => ({
  id: "c1",
  category: "async",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  line_start: 23,
  line_end: 31,
  confidence: 0.91,
  status: "pending",
  ...over,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages, skills: skillsMessages }}>
      <ToastProvider>
        <ConventionsView repoId="r1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("empty state runs the extraction", () => {
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Run extraction/ }));
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });

  it("lists candidates with evidence ref, confidence and the accepted counter", () => {
    list = [conv({ status: "accepted" }), conv({ id: "c2", rule: "Redis via singleton", confidence: 0.78, line_start: 1, line_end: 1, evidence_path: "src/lib/redis.ts" })];
    renderView();
    expect(screen.getByText("payments-api")).toBeTruthy();
    expect(screen.getByText("1 of 2 accepted")).toBeTruthy();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeTruthy();
    expect(screen.getByText("src/lib/redis.ts:1")).toBeTruthy();
    expect(screen.getByText("91%")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create skill/ })).not.toHaveProperty("disabled", true);
  });

  it("accept / un-accept / reject call the API with the next status", () => {
    list = [conv({}), conv({ id: "c2", status: "accepted", rule: "Other rule" })];
    renderView();
    const first = within(screen.getByTestId("convention-c1"));
    fireEvent.click(first.getByRole("button", { name: /Accept/ }));
    expect(updateMutate).toHaveBeenLastCalledWith({ id: "c1", patch: { status: "accepted" } }, expect.anything());
    fireEvent.click(first.getByRole("button", { name: /Reject/ }));
    expect(updateMutate).toHaveBeenLastCalledWith({ id: "c1", patch: { status: "rejected" } }, expect.anything());
    fireEvent.click(within(screen.getByTestId("convention-c2")).getByRole("button", { name: /Accepted/ }));
    expect(updateMutate).toHaveBeenLastCalledWith({ id: "c2", patch: { status: "pending" } }, expect.anything());
  });

  it("edits a rule inline", () => {
    list = [conv({})];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByLabelText("Rule text"), { target: { value: "Use await, never .then()" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMutate).toHaveBeenLastCalledWith(
      { id: "c1", patch: { rule: "Use await, never .then()" } },
      expect.anything(),
    );
  });

  it("Deselect all / Accept all; Create skill is disabled with nothing accepted", () => {
    list = [conv({})];
    const { unmount } = renderView();
    expect((screen.getByRole("button", { name: /Create skill/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Accept all/ }));
    expect(setAllMutate).toHaveBeenLastCalledWith("accepted", expect.anything());
    unmount();
    list = [conv({ status: "accepted" })];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Deselect all/ }));
    expect(setAllMutate).toHaveBeenLastCalledWith("pending", expect.anything());
  });

  it("Create skill modal: prefilled from the draft, editable, attaches to the chosen agent", async () => {
    list = [conv({ status: "accepted" })];
    draft = {
      name: "payments-api-conventions",
      description: "Use when reviewing changes to payments-api.",
      type: "convention",
      body: "# payments-api-conventions\n\n## rule\nUse await.",
      evidence_files: ["src/api/users.ts"],
      convention_ids: ["c1"],
    };
    createMutateAsync.mockResolvedValue({
      skill: { id: "s9", name: "payments-api-conventions" },
      linked_agent_id: "ag-api",
    });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    await waitFor(() => expect(screen.getByText("Create skill from conventions")).toBeTruthy());
    expect(screen.getByText("payments-api-conventions.md")).toBeTruthy();
    expect(screen.getByText("unsaved")).toBeTruthy();
    expect(screen.getByText("Saved as v1 · added to Skills Lab")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Use on every payments-api PR." } });
    fireEvent.change(screen.getByDisplayValue(/## rule/), { target: { value: "# edited body" } });
    fireEvent.change(screen.getByDisplayValue("Don't attach"), { target: { value: "ag-api" } });

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Create skill/ }));
    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "payments-api-conventions",
        description: "Use on every payments-api PR.",
        type: "convention",
        body: "# edited body",
        enabled: true,
        agent_id: "ag-api",
      }),
    );
    await waitFor(() => expect(screen.queryByText("Create skill from conventions")).toBeNull());
  });
});

describe("conventions helpers", () => {
  it("evidenceRef / confidenceColor / status transitions", () => {
    expect(evidenceRef({ evidence_path: "a.ts", line_start: 3, line_end: 3 })).toBe("a.ts:3");
    expect(evidenceRef({ evidence_path: "a.ts", line_start: null, line_end: null })).toBe("a.ts");
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.6)).toBe("var(--warn)");
    expect(confidenceColor(0.2)).toBe("var(--crit)");
    expect(nextStatusOnAccept(conv({ status: "accepted" }))).toBe("pending");
    expect(nextStatusOnAccept(conv({ status: "rejected" }))).toBe("accepted");
    expect(nextStatusOnReject(conv({ status: "rejected" }))).toBe("pending");
  });
});
