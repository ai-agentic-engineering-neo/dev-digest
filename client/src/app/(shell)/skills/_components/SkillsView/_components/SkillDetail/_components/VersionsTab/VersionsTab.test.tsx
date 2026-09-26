import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "@messages/en/skills.json";
import commonMessages from "@messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const restoreMutate = vi.fn();
const versions: SkillVersion[] = [
  { version: 2, note: "Tightened the rule", created_at: "2026-09-20T00:00:00Z", current: true },
  { version: 1, note: null, created_at: "2026-09-10T00:00:00Z", current: false },
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: versions, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
  useSkillVersion: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for PR quality",
  type: "rubric",
  source: "manual",
  body: "current body",
  enabled: true,
  version: 2,
};

function renderWithProviders() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common: commonMessages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab — Restore is gated behind the confirm dialog", () => {
  it("does not restore until the confirm dialog is confirmed", () => {
    renderWithProviders();

    // Only the non-current row (v1) gets a Restore action.
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(restoreMutate).not.toHaveBeenCalled();
    // The confirm dialog is now open, asking about v1 specifically.
    expect(screen.getByText(/Restore v1\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("restores the version once the dialog is confirmed", () => {
    renderWithProviders();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    // The dialog's own confirm button shares the "Restore" label — it's now
    // the second one in the document.
    const confirmButtons = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(restoreMutate).toHaveBeenCalledTimes(1);
    expect(restoreMutate).toHaveBeenCalledWith(1, expect.anything());
  });
});
