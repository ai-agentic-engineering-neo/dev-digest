import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Flags weak PR descriptions",
  type: "rubric",
  source: "manual",
  body: "# Rule\nBe specific.",
  enabled: true,
  version: 2,
  evidence_files: null,
  agents_count: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Skill Editor ConfigTab (smoke)", () => {
  it("renders the fields and the body panel filename", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("pr-quality-rubric.md")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("shows an unsaved badge and change-note field once the body diverges from saved", () => {
    const { container } = renderWithIntl(<ConfigTab skill={SKILL} />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: SKILL.body + "\nMore." } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("What changed and why…")).toBeInTheDocument();
  });

  it("calls useUpdateSkill on Save", () => {
    renderWithIntl(<ConfigTab skill={SKILL} />);
    fireEvent.click(screen.getByText("Save"));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sk1", patch: expect.objectContaining({ name: "pr-quality-rubric" }) }),
      expect.anything(),
    );
  });
});
