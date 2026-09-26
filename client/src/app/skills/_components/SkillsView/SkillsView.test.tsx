import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import shell from "../../../../../messages/en/shell.json";
import { ToastProvider } from "../../../../lib/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/skills",
}));
vi.mock("../../../../components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const delMutate = vi.fn();
const SKILL: Skill = {
  id: "s1", name: "breaking-change", description: "d", type: "rubric", source: "manual",
  body: "b", enabled: true, version: 1, evidence_files: null, agent_count: 0,
};
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: [SKILL], isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useDeleteSkill: () => ({ mutate: delMutate, isPending: false }),
  useSkill: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { SkillsView } from "./SkillsView";

afterEach(() => {
  cleanup();
  delMutate.mockReset();
});

describe("SkillsView delete confirmation", () => {
  it("opens one dialog beside the grid and deletes only after Delete skill is confirmed", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills, shell }}>
        <ToastProvider>
          <SkillsView />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByLabelText("Delete skill"));
    expect(delMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText('Delete skill "breaking-change"?')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByLabelText("Delete skill"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Delete skill$/ }));
    expect(delMutate).toHaveBeenCalledWith("s1", expect.anything());
  });
});
