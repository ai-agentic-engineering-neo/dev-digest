import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsPreviewCard } from "./FindingsPreviewCard";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

describe("FindingsPreviewCard", () => {
  it("shows the templated title with the real finding count", () => {
    render(<FindingsPreviewCard findings={FINDINGS} title="1 FINDINGS IN THIS RUN" top={0} left={0} />);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
  });

  it("shows severity, title, category, file:line, and confidence for each finding", () => {
    render(<FindingsPreviewCard findings={FINDINGS} title="1 FINDINGS IN THIS RUN" top={0} left={0} />);
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
  });

  it("is read-only — renders no buttons", () => {
    render(<FindingsPreviewCard findings={FINDINGS} title="1 FINDINGS IN THIS RUN" top={0} left={0} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
