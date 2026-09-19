import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false }),
}));

import { SkillRailCard } from "./SkillRailCard";

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

describe("SkillRailCard (smoke)", () => {
  it("renders the skill's name, type badge and used-by count", () => {
    renderWithIntl(<SkillRailCard skill={SKILL} />);
    expect(screen.getByText("test-coverage-nudge")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
  });

  it("toggling the switch patches only `enabled`, never the body/version path", () => {
    renderWithIntl(<SkillRailCard skill={SKILL} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(mutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
  });

  it("requests deletion without deleting directly", () => {
    const onDeleteRequest = vi.fn();
    renderWithIntl(<SkillRailCard skill={SKILL} onDeleteRequest={onDeleteRequest} />);
    fireEvent.click(screen.getByLabelText(`Delete "${SKILL.name}"`));
    expect(onDeleteRequest).toHaveBeenCalledWith(SKILL);
  });
});
