import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionsSkillPreview } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";

const PREVIEW: ConventionsSkillPreview = {
  name: "repo-conventions",
  description: "Flags changes that violate the 2 house conventions extracted from acme/payments-api.",
  type: "convention",
  body: "# repo-conventions\n\n## Async\n\n- **Always use async/await.**",
  evidence_files: ["src/api/users.ts"],
  candidate_count: 2,
};

const previewAsync = vi.fn();
const createAsync = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  usePreviewConventionsSkill: () => ({ mutateAsync: previewAsync }),
  useCreateConventionsSkill: () => ({ mutateAsync: createAsync, isPending: false }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "General Reviewer" }] }),
}));

import { CreateConventionsSkillModal } from "./CreateConventionsSkillModal";

function renderModal(props: Partial<React.ComponentProps<typeof CreateConventionsSkillModal>> = {}) {
  const merged = {
    repoId: "r1",
    repoFullName: "acme/payments-api",
    candidateIds: ["c1", "c2"],
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...props,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <CreateConventionsSkillModal {...merged} />
    </NextIntlClientProvider>,
  );
  return merged;
}

afterEach(cleanup);
// Block bodies on purpose: `mockReset()` returns the mock, and a function
// returned from a vitest hook is treated as a teardown callback.
beforeEach(() => {
  previewAsync.mockReset();
  createAsync.mockReset();
  previewAsync.mockResolvedValue(PREVIEW);
  createAsync.mockResolvedValue({ id: "sk1", name: "repo-conventions" });
});

describe("CreateConventionsSkillModal", () => {
  it("explains where the skill comes from", async () => {
    renderModal();
    expect(
      await screen.findByText(/Merged from 2 accepted conventions in acme\/payments-api/),
    ).toBeInTheDocument();
  });

  it("loads the server-rendered body and lets it be edited before saving", async () => {
    renderModal();
    const body = await screen.findByLabelText("repo-conventions.md");
    expect(body).toHaveValue(PREVIEW.body);

    fireEvent.change(body, { target: { value: `${PREVIEW.body}\n\n- **Hand-written rule.**` } });
    expect((body as HTMLTextAreaElement).value).toContain("Hand-written rule");
  });

  it("sends the edited text, not the preview, on create", async () => {
    renderModal();
    const body = await screen.findByLabelText("repo-conventions.md");
    fireEvent.change(body, { target: { value: "# edited" } });
    fireEvent.click(screen.getByRole("button", { name: /^create skill$/i }));

    await waitFor(() => expect(createAsync).toHaveBeenCalled());
    expect(createAsync.mock.calls[0]![0]).toMatchObject({
      candidate_ids: ["c1", "c2"],
      name: "repo-conventions",
      body: "# edited",
      enabled: true,
    });
  });

  it("carries the chosen agent so the skill is linked as it is created", async () => {
    renderModal();
    await screen.findByLabelText("repo-conventions.md");
    fireEvent.change(screen.getByDisplayValue("Don't link yet"), { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: /^create skill$/i }));

    await waitFor(() => expect(createAsync).toHaveBeenCalled());
    expect(createAsync.mock.calls[0]![0]).toMatchObject({ agent_id: "a1" });
  });

  it("writes nothing when cancelled", async () => {
    const { onClose } = renderModal();
    await screen.findByLabelText("repo-conventions.md");
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(createAsync).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("reports a failed create instead of sitting silent", async () => {
    createAsync.mockRejectedValue(new Error("nope"));
    renderModal();
    await screen.findByLabelText("repo-conventions.md");
    fireEvent.click(screen.getByRole("button", { name: /^create skill$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create the skill/i);
  });
});
