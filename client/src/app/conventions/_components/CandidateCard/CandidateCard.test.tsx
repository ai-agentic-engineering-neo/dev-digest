import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";
import { CandidateCard } from "./CandidateCard";

afterEach(cleanup);

const CAND: ConventionCandidate = {
  id: "c1", repo_id: "r1", scan_id: "s1", category: "async",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts", evidence_line: 23, evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91, status: "candidate", updated_at: "2026-09-26T10:00:00.000Z",
};

const renderCard = (candidate: ConventionCandidate, onChange = vi.fn()) => {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CandidateCard candidate={candidate} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
};

describe("CandidateCard", () => {
  it("shows rule, evidence file:line, snippet and confidence; Accept and Reject send the status", () => {
    const onChange = renderCard(CAND);
    expect(screen.getByText(CAND.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Accept"));
    expect(onChange).toHaveBeenLastCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByText("Reject"));
    expect(onChange).toHaveBeenLastCalledWith({ status: "rejected" });
  });

  it("an accepted card toggles back to candidate; a rejected card offers Reconsider", () => {
    const onChange = renderCard({ ...CAND, status: "accepted" });
    fireEvent.click(screen.getByText("Accepted"));
    expect(onChange).toHaveBeenLastCalledWith({ status: "candidate" });
    cleanup();
    const onChange2 = renderCard({ ...CAND, status: "rejected" });
    fireEvent.click(screen.getByText("Reconsider"));
    expect(onChange2).toHaveBeenLastCalledWith({ status: "candidate" });
  });

  it("Edit switches the card to an inline form and Save sends rule + category", () => {
    const onChange = renderCard(CAND);
    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByDisplayValue(CAND.rule);
    fireEvent.change(input, { target: { value: "Use async/await; never chain .then()." } });
    fireEvent.click(screen.getByText("Save"));
    expect(onChange).toHaveBeenLastCalledWith({ rule: "Use async/await; never chain .then().", category: "async" });
    // back to display mode, same card, no navigation
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });
});
