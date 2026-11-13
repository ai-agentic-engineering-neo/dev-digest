import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeverityCounts } from "./SeverityCounts";
import { countBySeverity, latestReviewsPerAgent } from "./helpers";
import { finding } from "./fixtures.test-utils";

afterEach(cleanup);

describe("SeverityCounts", () => {
  it("renders only the severities that are present", () => {
    render(<SeverityCounts counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 3 }} />);
    expect(screen.getByLabelText("2 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("3 Suggestion")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Warning/)).not.toBeInTheDocument();
  });

  it("renders a dash when there are no findings", () => {
    render(<SeverityCounts counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("countBySeverity / latestReviewsPerAgent", () => {
  it("groups findings by severity", () => {
    expect(
      countBySeverity([
        finding({ severity: "CRITICAL" }),
        finding({ severity: "WARNING" }),
        finding({ severity: "WARNING" }),
      ]),
    ).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
  });

  it("keeps the newest review of each agent, ignoring summaries", () => {
    const base = { pr_id: "p", run_id: null, verdict: null, summary: null, score: null, model: null, findings: [] };
    const picked = latestReviewsPerAgent([
      { ...base, id: "sec-old", agent_id: "sec", kind: "review", created_at: "2026-01-01T00:00:00Z" },
      { ...base, id: "sec-new", agent_id: "sec", kind: "review", created_at: "2026-02-01T00:00:00Z" },
      { ...base, id: "perf", agent_id: "perf", kind: "review", created_at: "2026-02-02T00:00:00Z" },
      { ...base, id: "sum", agent_id: "perf", kind: "summary", created_at: "2026-03-01T00:00:00Z" },
    ]);
    expect(picked.map((r) => r.id).sort()).toEqual(["perf", "sec-new"]);
  });
});
