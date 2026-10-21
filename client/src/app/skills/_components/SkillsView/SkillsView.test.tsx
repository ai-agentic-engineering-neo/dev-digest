import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import shell from "../../../../../messages/en/shell.json";
import { ToastProvider } from "../../../../lib/toast";

const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => "/skills",
}));
vi.mock("../../../../components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
// the editor's tabs are covered by their own tests; here it is a labelled stub
vi.mock("../../[id]/_components/SkillEditor", () => ({
  SkillEditor: ({ id, tab }: { id: string; tab: string }) => <section data-testid="skill-editor">{`editor ${id} ${tab}`}</section>,
}));

const S1: Skill = {
  id: "s1", name: "breaking-change", description: "d1", type: "rubric", source: "manual",
  body: "b", enabled: true, version: 1, evidence_files: null, agent_count: 0,
};
const S2: Skill = { ...S1, id: "s2", name: "lethal-trifecta", description: "d2", type: "security" };
const data = { list: [S1, S2] as Skill[] };
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: data.list, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
}));

import { SkillsView } from "./SkillsView";

beforeEach(() => {
  query = "";
  data.list = [S1, S2];
});
afterEach(() => {
  cleanup();
  replace.mockReset();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills, shell }}>
      <ToastProvider>
        <SkillsView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsView (master-detail)", () => {
  it("lists the skills in the left column and opens the first one when the URL names none", () => {
    renderView();
    const column = screen.getByRole("complementary", { name: "Skills" });
    expect(within(column).getAllByTestId("skill-card")).toHaveLength(2);
    expect(replace).toHaveBeenCalledWith("/skills?skill=s1");
  });

  it("renders the editor inline for ?skill= with its ?tab=, and selecting another card keeps the tab", () => {
    query = "skill=s2&tab=versioning";
    renderView();
    expect(screen.getByTestId("skill-editor")).toHaveTextContent("editor s2 versioning");
    expect(screen.getByRole("button", { name: "lethal-trifecta" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "breaking-change" }));
    expect(replace).toHaveBeenLastCalledWith("/skills?skill=s1&tab=versioning");
  });

  it("filters the column by search and shows the no-match state; the editor stays", () => {
    query = "skill=s1";
    renderView();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "lethal" } });
    expect(screen.getAllByTestId("skill-card")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "zzz" } });
    expect(screen.getByText("No matching skills")).toBeInTheDocument();
    expect(screen.getByTestId("skill-editor")).toBeInTheDocument();
  });

  it("with no skills shows the empty state with a create CTA instead of an editor", () => {
    data.list = [];
    renderView();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(screen.queryByTestId("skill-editor")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
