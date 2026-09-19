import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const mutate = vi.fn();
vi.mock("../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false }),
}));

import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const SKILL: SkillSummary = {
  id: "sk1",
  name: "test-coverage-nudge",
  description: "every new branch needs an assertion that fails without it",
  type: "custom",
  source: "manual",
  body: "# Rule\nCover it.",
  enabled: true,
  version: 2,
  token_estimate: 42,
  used_by: 3,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);
}

describe("SkillCard (smoke)", () => {
  it("renders the skill's name, type chip and used-by count", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("test-coverage-nudge")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });

  it("toggling the switch patches only `enabled`", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(mutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
  });

  it("requests deletion without deleting directly", () => {
    const onDeleteRequest = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onDeleteRequest={onDeleteRequest} />);
    fireEvent.click(screen.getByLabelText(`Delete "${SKILL.name}"`));
    expect(onDeleteRequest).toHaveBeenCalledWith(SKILL);
  });

  it("clicking the card body fires onClick", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);
    fireEvent.click(screen.getByText("test-coverage-nudge"));
    expect(onClick).toHaveBeenCalled();
  });
});
