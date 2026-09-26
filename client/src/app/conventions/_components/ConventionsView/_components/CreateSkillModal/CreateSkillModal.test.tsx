import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const DRAFT = {
  name: "repo-conventions",
  description: "3 house conventions extracted from payments-api; flag PR changes that break any of them.",
  type: "convention" as const,
  body: "# repo-conventions\n\nHouse conventions for `acme/payments-api`.\n\n## async-await\nAlways use async/await.",
  accepted_count: 3,
  existing_skill_id: null,
};
const createMutateAsync = vi.fn(async (input: unknown) => ({ skill: { id: "new", name: "repo-conventions", version: 1, ...(input as object) }, updated_existing: false }));
vi.mock("../../../../../../lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => ({ data: DRAFT, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateConventionSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "ag-sec", name: "Security Reviewer" }, { id: "ag-gen", name: "General Reviewer" }] }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(cleanup);

describe("CreateSkillModal (conventions)", () => {
  it("prefills from the server draft, lets the body and metadata be edited, and creates with the chosen agent", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
        <ToastProvider>
          <CreateSkillModal repoId="r1" repoName="payments-api" onClose={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText(/Merged from 3 accepted conventions in payments-api/)).toBeInTheDocument();
    const name = await screen.findByDisplayValue("repo-conventions");
    const body = screen.getByDisplayValue((_, el) => (el as HTMLTextAreaElement).value === DRAFT.body);
    fireEvent.change(body, { target: { value: `${DRAFT.body}\n\n## extra\nEdited in the modal.` } });
    fireEvent.change(name, { target: { value: "payments-api-conventions" } });
    expect(screen.getByText(/≈ \d+ tokens/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0]![0]).toMatchObject({
      repoId: "r1",
      name: "payments-api-conventions",
      type: "convention",
      enabled: true,
      agent_id: "ag-gen",
    });
    expect((createMutateAsync.mock.calls[0]![0] as { body: string }).body).toContain("Edited in the modal.");
  });
});
