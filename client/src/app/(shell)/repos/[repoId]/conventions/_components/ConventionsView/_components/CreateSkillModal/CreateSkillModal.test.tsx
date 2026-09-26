import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventionsMessages from "@messages/en/conventions.json";
import skillsMessages from "@messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const previewMutate = vi.fn();
const createMutate = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useConventionsSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateConventionsSkill: () => ({ mutate: createMutate, isPending: false }),
  useSkillTokenCount: () => ({ tokens: 42, isLoading: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  previewMutate.mockClear();
  createMutate.mockClear();
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages, skills: skillsMessages }}>
      <ToastProvider>
        <CreateSkillModal repoId="repo-1" repoName="acme/api" acceptedCount={2} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

function resolvePreview(data: {
  name: string;
  description: string;
  type: string;
  body: string;
  accepted_count: number;
  name_taken_by: string | null;
}) {
  const onSuccess = previewMutate.mock.calls[0]?.[1]?.onSuccess as (d: unknown) => void;
  act(() => onSuccess(data));
}

describe("CreateSkillModal", () => {
  it("names the accepted count and the repo in the banner", () => {
    renderModal();
    expect(screen.getByText("2 accepted conventions")).toBeTruthy();
    expect(screen.getByText("acme/api")).toBeTruthy();
  });

  it("previews on mount (writes nothing) and seeds the form from the response", async () => {
    renderModal();
    expect(previewMutate).toHaveBeenCalledTimes(1);
    expect(createMutate).not.toHaveBeenCalled();

    resolvePreview({
      name: "repo-conventions",
      description: "House conventions",
      type: "convention",
      body: "# repo-conventions\n...",
      accepted_count: 2,
      name_taken_by: null,
    });

    expect(await screen.findByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("House conventions")).toBeInTheDocument();
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
  });

  it("a name clash shows the save-as-new-version / rename choice, defaulting to rename (no replace_skill_id)", async () => {
    renderModal();
    resolvePreview({
      name: "repo-conventions",
      description: "House conventions",
      type: "convention",
      body: "body",
      accepted_count: 1,
      name_taken_by: "existing-skill-id",
    });

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({ replace_skill_id: undefined });
  });

  it("choosing 'save as a new version' sends replace_skill_id on Create", async () => {
    renderModal();
    resolvePreview({
      name: "repo-conventions",
      description: "House conventions",
      type: "convention",
      body: "body",
      accepted_count: 1,
      name_taken_by: "existing-skill-id",
    });
    await screen.findByText(/already exists/);

    fireEvent.click(screen.getByLabelText(/Save as a new version/));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({ replace_skill_id: "existing-skill-id" });
  });
});
