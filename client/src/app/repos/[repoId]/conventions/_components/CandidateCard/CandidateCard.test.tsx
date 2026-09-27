import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { CandidateCard } from "./CandidateCard";

const candidate: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  rule: "Always use async/await instead of .then() chains.",
  category: "async",
  status: "pending",
  confidence: 0.91,
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  evidence_sha: "abc1234",
  scan_id: "s1",
  skill_id: null,
  created_at: "2026-09-22T10:00:00.000Z",
  updated_at: "2026-09-22T10:00:00.000Z",
};

function renderCard(props: Partial<React.ComponentProps<typeof CandidateCard>> = {}) {
  const merged = {
    candidate,
    repoFullName: "acme/payments-api",
    onStatus: vi.fn(),
    onEdit: vi.fn(),
    ...props,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CandidateCard {...merged} />
    </NextIntlClientProvider>,
  );
  return merged;
}

afterEach(cleanup);

describe("CandidateCard", () => {
  it("shows the rule, the source file and the confidence percentage", () => {
    renderCard();
    expect(screen.getByText(candidate.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("says how widespread the rule is when the model gave a reason", () => {
    renderCard({ candidate: { ...candidate, rationale: "Used in 41 of 44 async functions." } });
    expect(screen.getByText("Why:")).toBeInTheDocument();
    expect(screen.getByText(/Used in 41 of 44 async functions\./)).toBeInTheDocument();
  });

  it("shows no Why line when there is no reason", () => {
    renderCard({ candidate: { ...candidate, rationale: null } });
    expect(screen.queryByText("Why:")).not.toBeInTheDocument();
  });

  it("links the evidence to the exact lines on GitHub, pinned to the scanned commit", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /src\/api\/users\.ts:23-31/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc1234/src/api/users.ts#L23-L31",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders the citation as plain text when there is no commit to pin to", () => {
    renderCard({ candidate: { ...candidate, evidence_sha: null } });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
  });

  it("offers accept, reject and edit", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("accepts and rejects through the same callback", () => {
    const { onStatus } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
    expect(onStatus).toHaveBeenCalledWith("accepted");
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onStatus).toHaveBeenCalledWith("rejected");
  });

  it("puts an accepted card back in play when Accept is clicked again", () => {
    const { onStatus } = renderCard({ candidate: { ...candidate, status: "accepted" } });
    fireEvent.click(screen.getByRole("button", { name: /accepted/i }));
    expect(onStatus).toHaveBeenCalledWith("pending");
  });

  it("edits in place: the rule becomes a field on this card, not another page", () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const input = screen.getByLabelText(/convention rule/i);
    expect(input).toHaveValue(candidate.rule);
    fireEvent.change(input, { target: { value: "Prefer await over .then()." } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith({
      rule: "Prefer await over .then().",
      category: "async",
    });
  });

  it("drops the draft on cancel", () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/convention rule/i), {
      target: { value: "Something else" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText(candidate.rule)).toBeInTheDocument();
  });

  it("offers only Restore once a candidate is rejected", () => {
    const { onStatus } = renderCard({ candidate: { ...candidate, status: "rejected" } });
    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onStatus).toHaveBeenCalledWith("pending");
  });

  it("says when the rule already lives in a skill", () => {
    const onOpenSkill = vi.fn();
    renderCard({ candidate: { ...candidate, skill_id: "sk1" }, onOpenSkill });
    fireEvent.click(screen.getByRole("button", { name: /in a skill/i }));
    expect(onOpenSkill).toHaveBeenCalledWith("sk1");
  });
});
