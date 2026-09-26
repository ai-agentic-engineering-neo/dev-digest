/**
 * ConfigTab — the CRITICAL `enabled` staleness bug (WP1 / frontend-react-2-1):
 * `enabled` is NOT local form state, so a save can never resurrect a value the
 * rail's toggle has since changed, and the header toggle itself saves
 * immediately, independent of the rest of the form.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const updateMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useSkillTypes: () => ({ data: [{ id: "t1", name: "rubric" }] }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));

import { ConfigTab } from "./ConfigTab";

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Rubric for PR quality",
  type: "rubric",
  source: "manual",
  body: "# Body",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderTab(skill: Skill) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ConfigTab skill={skill} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => updateMutate.mockClear());
afterEach(cleanup);

describe("ConfigTab", () => {
  it("never resends `enabled` on save, even after the rail toggles it for the same id+version", () => {
    // SkillEditor keys ConfigTab by `${id}:${version}` — a same id+version
    // rerender (e.g. the rail's SkillCard toggle flipping `enabled`) reuses
    // this component instance rather than remounting it.
    const { rerender } = renderTab(SKILL);
    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ConfigTab skill={{ ...SKILL, enabled: false }} />
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getByDisplayValue("Rubric for PR quality"), {
      target: { value: "Updated description" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save skill/ }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [call] = updateMutate.mock.calls[0]!;
    expect(call.patch).not.toHaveProperty("enabled");
    expect(call.patch).toMatchObject({ description: "Updated description" });
  });

  it("the header toggle saves `enabled` immediately, independent of the rest of the form", () => {
    renderTab(SKILL);
    fireEvent.click(screen.getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { enabled: false } });
  });
});
