import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, Repo } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/conventions", () => ({
  useUpdateConvention: () => ({ mutate, isPending: false }),
}));

import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);
beforeEach(() => mutate.mockReset());

const REPO = { full_name: "acme/payments-api", default_branch: "main", name: "payments-api" } as Repo;

const conv = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  category: "style",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  ...over,
});

function renderCard(c: ConventionCandidate) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ConventionCard repoId="r1" repo={REPO} convention={c} />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("shows the rule, the evidence link on the default branch, the snippet and confidence", () => {
    renderCard(conv());
    expect(screen.getByText("Always use async/await instead of .then() chains")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/api/users.ts:23" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23");
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
  });

  it("accepts and rejects a pending candidate", () => {
    renderCard(conv());
    fireEvent.click(screen.getByRole("button", { name: "Accept as Skill" }));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "accepted" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "rejected" } });
  });

  it("edits first, then saves the edit as accepted", () => {
    renderCard(conv());
    fireEvent.click(screen.getByRole("button", { name: "Edit first" }));
    const rule = screen.getByDisplayValue("Always use async/await instead of .then() chains");
    fireEvent.change(rule, { target: { value: "  Use async/await, never .then()  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save & accept" }));
    expect(mutate).toHaveBeenCalledWith(
      {
        id: "c1",
        patch: {
          rule: "Use async/await, never .then()",
          category: "style",
          evidence_snippet: "const user = await db.users.find(id);",
          status: "accepted",
        },
      },
      expect.anything(),
    );
  });

  it("offers Undo for a resolved candidate", () => {
    renderCard(conv({ status: "rejected" }));
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept as Skill" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "pending" } });
  });
});
