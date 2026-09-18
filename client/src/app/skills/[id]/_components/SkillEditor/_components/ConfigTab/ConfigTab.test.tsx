import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const mutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
}));

vi.mock("../../../../../../../lib/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const SKILL: Skill = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Uncovered branches",
  description: "Flag new production paths with no asserting test.",
  type: "custom",
  source: "manual",
  body: "# Uncovered branches\nRequire an assertion per new branch.",
  enabled: true,
  version: 1,
};

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ConfigTab skill={skill} />
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("save sends name, description, type and body", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(mutate).toHaveBeenCalledWith(
      {
        id: SKILL.id,
        patch: {
          name: SKILL.name,
          description: SKILL.description,
          type: SKILL.type,
          body: SKILL.body,
          enabled: true,
        },
      },
      expect.any(Object),
    );
  });

  it("empty description does not call PUT", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue(SKILL.description), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("marks description as the skill interface (directive)", () => {
    renderTab();
    expect(screen.getByText(/skill interface/i)).toBeInTheDocument();
    expect(screen.getByText(/directive/i)).toBeInTheDocument();
  });
});
