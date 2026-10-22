import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import { confidenceColor, evidenceLabel, nextStatus } from "./helpers";

vi.mock("@/lib/toast", () => ({ useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }) }));

import { ConventionCard } from "./ConventionCard";

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "async-await-only",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_start_line: 23,
  evidence_end_line: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
};

afterEach(cleanup);

function renderCard(candidate: ConventionCandidate, onStatus = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ConventionCard candidate={candidate} repoFullName="acme/payments-api" sourceSha="abc123" onStatus={onStatus} />
    </NextIntlClientProvider>,
  );
  return onStatus;
}

describe("ConventionCard", () => {
  it("shows the rule, evidence linked to the scanned commit, snippet and confidence", () => {
    renderCard(CANDIDATE);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    const link = screen.getByText("src/api/users.ts:23-31").closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc123/src/api/users.ts#L23-L31");
    expect(screen.getByText(CANDIDATE.evidence_snippet!)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("accepts / rejects a pending candidate", () => {
    const onStatus = renderCard(CANDIDATE);
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(onStatus.mock.calls).toEqual([["accepted"], ["rejected"]]);
  });

  it("clicking Accepted again resets to pending", () => {
    const onStatus = renderCard({ ...CANDIDATE, status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: /Accepted/ }));
    expect(onStatus).toHaveBeenCalledWith("pending");
  });
});

describe("ConventionCard helpers", () => {
  it("colours strong candidates green, the rest amber", () => {
    expect(confidenceColor(85)).toBe("var(--ok)");
    expect(confidenceColor(78)).toBe("var(--warn)");
  });

  it("nextStatus toggles back to pending", () => {
    expect(nextStatus("pending", "accepted")).toBe("accepted");
    expect(nextStatus("accepted", "accepted")).toBe("pending");
    expect(nextStatus("accepted", "rejected")).toBe("rejected");
  });

  it("evidenceLabel formats single and multi-line ranges", () => {
    expect(evidenceLabel(CANDIDATE)).toBe("src/api/users.ts:23-31");
    expect(evidenceLabel({ ...CANDIDATE, evidence_end_line: 23 })).toBe("src/api/users.ts:23");
    expect(evidenceLabel({ ...CANDIDATE, evidence_path: null })).toBeNull();
  });
});
