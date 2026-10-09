import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import * as skillHooks from "@/lib/hooks/skills";
import * as toastLib from "@/lib/toast";
import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# Rubric v2",
  enabled: true,
  version: 2,
  evidence_files: null,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 1, body: "# Rubric v1", created_at: "2026-08-01T00:00:00.000Z" },
];

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mockVersions(data: SkillVersion[]) {
  vi.spyOn(skillHooks, "useSkillVersions").mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof skillHooks.useSkillVersions>);
}

// Matches only the shape VersionsTab actually calls `restore.mutate` with —
// not the real (richer) `UseMutateFunction` signature, which strict param
// contravariance would reject a 1-arg `onSuccess`/0-arg `onError` mock against.
type RestoreMutate = (
  vars: { id: string; version: number },
  opts?: { onSuccess?: (data: Skill) => void; onError?: () => void },
) => void;

function mockRestore(mutate: RestoreMutate, isPending = false) {
  vi.spyOn(skillHooks, "useRestoreSkillVersion").mockReturnValue({
    mutate,
    isPending,
  } as unknown as ReturnType<typeof skillHooks.useRestoreSkillVersion>);
}

function mockToast() {
  const success = vi.fn();
  const error = vi.fn();
  vi.spyOn(toastLib, "useToast").mockReturnValue({ success, error, info: vi.fn(), toast: vi.fn() });
  return { success, error };
}

describe("VersionsTab — restore", () => {
  it("does nothing if the user cancels the confirm dialog", () => {
    mockVersions(VERSIONS);
    const mutate = vi.fn();
    mockRestore(mutate);
    mockToast();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("v1"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(mutate).not.toHaveBeenCalled();
  });

  it("restores the selected version on confirm, clears the selection, and toasts on success", () => {
    mockVersions(VERSIONS);
    const mutate = vi.fn((_input, opts?: { onSuccess?: (d: Skill) => void }) => {
      opts?.onSuccess?.({ ...SKILL, version: 3, body: "# Rubric v1" });
    });
    mockRestore(mutate);
    const { success } = mockToast();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("v1"));
    expect(screen.getByText("Version v1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(mutate).toHaveBeenCalledWith({ id: "sk1", version: 1 }, expect.anything());
    expect(success).toHaveBeenCalledWith("Restored as v3.");
    // Selection is cleared after a successful restore.
    expect(screen.queryByText("Version v1")).not.toBeInTheDocument();
  });

  it("toasts an error instead of throwing when the restore call fails", () => {
    mockVersions(VERSIONS);
    const mutate = vi.fn((_input, opts?: { onError?: () => void }) => {
      opts?.onError?.();
    });
    mockRestore(mutate);
    const { error } = mockToast();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(screen.getByText("v1"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(error).toHaveBeenCalledWith("Could not restore that version.");
  });
});
