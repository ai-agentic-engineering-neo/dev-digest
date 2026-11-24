import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/skills.json";
import { ApiError } from "@/lib/api";

const createAsync = vi.fn();
const updateAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createAsync, isPending: false }),
  useUpdateSkill: () => ({ mutateAsync: updateAsync, isPending: false }),
}));

import { SkillEditorModal } from "./SkillEditorModal";
import { validateDraft } from "./helpers";

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillEditorModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  createAsync.mockReset();
  updateAsync.mockReset();
});
afterEach(cleanup);

describe("SkillEditorModal", () => {
  it("shows the directive-description hint", () => {
    renderModal();
    expect(screen.getByText(/The description is the skill's interface/)).toBeInTheDocument();
    expect(screen.getByText(/when to apply it and what to check/)).toBeInTheDocument();
  });

  it("validates required fields and does not submit", () => {
    renderModal();
    fireEvent.click(screen.getByText("Save"));
    expect(screen.getAllByText("This field is required.")).toHaveLength(3);
    expect(createAsync).not.toHaveBeenCalled();
    expect(validateDraft({ name: " ", description: "x", type: "custom", body: "b" })).toEqual({ name: true });
  });

  it("submits the create payload", async () => {
    createAsync.mockResolvedValue({ id: "n" });
    const onClose = renderModal();
    fireEvent.change(screen.getByPlaceholderText("test-quality-rubric"), { target: { value: " my-skill " } });
    fireEvent.change(screen.getByPlaceholderText(/Apply when a PR adds/), { target: { value: "When X, check Y" } });
    fireEvent.change(screen.getByDisplayValue("custom"), { target: { value: "security" } });
    fireEvent.change(screen.getByPlaceholderText(/# Rule/), { target: { value: "# Body" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createAsync).toHaveBeenCalledWith({
      name: "my-skill",
      description: "When X, check Y",
      type: "security",
      body: "# Body",
      source: "manual",
    });
  });

  it("shows a server 422 error and stays open", async () => {
    createAsync.mockRejectedValue(new ApiError("Validation failed", 422, "validation", [{ message: "name too long" }]));
    const onClose = renderModal();
    fireEvent.change(screen.getByPlaceholderText("test-quality-rubric"), { target: { value: "a" } });
    fireEvent.change(screen.getByPlaceholderText(/Apply when a PR adds/), { target: { value: "d" } });
    fireEvent.change(screen.getByPlaceholderText(/# Rule/), { target: { value: "b" } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText(/Validation failed: name too long/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pre-fills from `initial` and saves with source, evidence files and enabled=false when toggled off", async () => {
    createAsync.mockResolvedValue({ id: "n" });
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillEditorModal
          onClose={vi.fn()}
          initial={{ name: "repo-conventions", description: "Apply when X; check Y.", type: "convention", body: "# b" }}
          source="extracted"
          evidenceFiles={["src/a.ts"]}
          title="From conventions"
          submitLabel="Create it"
          banner={<span>Merged from 2</span>}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("From conventions")).toBeInTheDocument();
    expect(screen.getByText("Merged from 2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("Create it"));
    await waitFor(() =>
      expect(createAsync).toHaveBeenCalledWith({
        name: "repo-conventions",
        description: "Apply when X; check Y.",
        type: "convention",
        body: "# b",
        source: "extracted",
        enabled: false,
        evidence_files: ["src/a.ts"],
      }),
    );
  });
});
