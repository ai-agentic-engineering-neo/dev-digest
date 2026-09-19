import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const mutate = vi.fn(
  (
    _input: { id: string; patch: Record<string, unknown> },
    opts?: { onSuccess?: (d: { version: number }) => void },
  ) => {
    // Only a body/name/description/type patch bumps the version; an
    // enabled-only patch (the kill switch) must never reach here in this
    // shape from the Save button — asserted separately below.
    opts?.onSuccess?.({ version: 3 });
  },
);
const deleteMutate = vi.fn((_id: string, opts?: { onSuccess?: () => void }) => {
  opts?.onSuccess?.();
});
const push = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useSkillAgents: (id?: string | null) => ({
    data: id ? [{ id: "ag1", name: "Test Quality Reviewer" }] : undefined,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  deleteMutate.mockClear();
  push.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "test-coverage-nudge",
  description: "every new branch needs an assertion that fails without it",
  type: "custom",
  source: "manual",
  body: "# Rule\nCover it.",
  enabled: true,
  version: 2,
  token_estimate: 42,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The body editor is the only multi-line textbox on the tab. */
const bodyTextarea = () =>
  screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;

describe("ConfigTab", () => {
  it("saving a body edit patches the full record and surfaces the new version as a toast", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);

    fireEvent.click(screen.getByText("Save"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sk1",
        patch: expect.objectContaining({ name: "test-coverage-nudge", body: "# Rule\nCover it." }),
      }),
      expect.anything(),
    );
    expect(screen.getByText("Saved (v3)")).toBeInTheDocument();
  });

  it("toggling Enabled patches only that field, independent of Save", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(mutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("marks the body as required and shows the current version beside the heading", () => {
    const { container } = renderWithIntl(<ConfigTab skill={SKILL} />);

    // Every required FormField renders a red asterisk — Name and the body.
    const marks = [...container.querySelectorAll("label span")].filter((el) => el.textContent === "*");
    expect(marks).toHaveLength(2);
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("Cancel is inert until something changes, then puts every field back", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeDisabled();
    expect(screen.queryByText(/Saving snapshots the body/)).not.toBeInTheDocument();

    const textarea = bodyTextarea();
    fireEvent.change(textarea, { target: { value: "# Rule\nCover it twice." } });

    expect(cancel).toBeEnabled();
    // The hint names the version this save would produce, not the current one.
    expect(screen.getByText("Saving snapshots the body as v3")).toBeInTheDocument();

    fireEvent.click(cancel);

    expect(bodyTextarea().value).toBe("# Rule\nCover it.");
    expect(cancel).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("deleting from the danger zone confirms first, then deletes and leaves for the list", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);

    // Nothing is deleted on the trigger alone.
    fireEvent.click(screen.getAllByRole("button", { name: /Delete skill/ })[0]!);
    expect(deleteMutate).not.toHaveBeenCalled();

    // The confirmation names the agents that lose the link.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Linked to: Test Quality Reviewer/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.anything());
    expect(push).toHaveBeenCalledWith("/skills");
  });
});
