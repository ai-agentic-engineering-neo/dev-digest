import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import type { ConventionCandidate } from "@devdigest/shared";

const mocks = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  extract: vi.fn(),
  update: vi.fn(),
  reject: vi.fn(),
  setAll: vi.fn(),
  createSkill: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api", default_branch: "main" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => mocks.list,
  useExtractConventions: () => ({ mutate: mocks.extract, isPending: false, data: undefined, error: null }),
  useUpdateConvention: () => ({ mutate: mocks.update }),
  useRejectConvention: () => ({ mutate: mocks.reject }),
  useSetAllConventionsAccepted: () => ({ mutate: mocks.setAll, isPending: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: mocks.createSkill, isPending: false }),
  useUpdateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

const cand = (id: string, accepted: boolean, over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id,
  rule: `Rule ${id}`,
  evidence_path: `src/${id}.ts`,
  evidence_snippet: `code ${id}`,
  confidence: 0.9,
  accepted,
  ...over,
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && m.mockReset());
  mocks.list.data = [];
  mocks.list.isLoading = false;
  mocks.list.isError = false;
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("empty state runs extraction", () => {
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Run extraction/ }));
    expect(mocks.extract).toHaveBeenCalled();
  });

  it("shows an error state with retry", () => {
    mocks.list.isError = true;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mocks.list.refetch).toHaveBeenCalled();
  });

  it("lists candidates, counts accepted, and Create skill is disabled with none accepted", () => {
    mocks.list.data = [cand("a", false), cand("b", false)];
    renderView();
    expect(screen.getByText("Rule a")).toBeTruthy();
    expect(screen.getByText("0 of 2 accepted")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Create skill/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("links each evidence file to the repo's default branch on GitHub", () => {
    mocks.list.data = [cand("a", false)];
    renderView();
    expect(screen.getByRole("link", { name: "src/a.ts" }).getAttribute("href")).toBe(
      "https://github.com/acme/payments-api/blob/main/src/a.ts",
    );
  });

  it("select all / deselect all go through the bulk call", () => {
    mocks.list.data = [cand("a", true), cand("b", true)];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(mocks.setAll).toHaveBeenCalledWith(false);
  });

  it("opens the modal prefilled from accepted candidates only, and saves an extracted convention skill", async () => {
    mocks.list.data = [cand("a", true), cand("b", false)];
    mocks.createSkill.mockResolvedValue({ id: "s1", name: "payments-api-conventions" });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByDisplayValue("payments-api-conventions")).toBeTruthy();
    const body = screen.getByDisplayValue(/Detected in `src\/a.ts`/) as HTMLTextAreaElement;
    expect(body.value).not.toContain("src/b.ts");

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create skill" }));
    await screen.findByText(/created\./);
    expect(mocks.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ type: "convention", source: "extracted", evidence_files: ["src/a.ts"] }),
    );
  });

  it("Cancel closes the modal without saving", () => {
    mocks.list.data = [cand("a", true)];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createSkill).not.toHaveBeenCalled();
  });

  it("card actions route to update/reject", () => {
    mocks.list.data = [cand("a", false)];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Accept as Skill" }));
    expect(mocks.update).toHaveBeenCalledWith({ id: "a", patch: { accepted: true } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(mocks.reject).toHaveBeenCalledWith("a");
  });
});
