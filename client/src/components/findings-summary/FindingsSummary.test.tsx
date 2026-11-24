import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsSummary } from "./FindingsSummary";
import { countBySeverity, latestAgentFindings } from "./helpers";

afterEach(cleanup);

const mk = (id: string, severity: FindingRecord["severity"]): FindingRecord => ({
  id,
  severity,
  category: "bug",
  title: `title ${id}`,
  file: "src/a.ts",
  start_line: 3,
  end_line: 5,
  rationale: "because",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
});

const FINDINGS = [mk("a", "CRITICAL"), mk("b", "CRITICAL"), mk("c", "SUGGESTION")];

const renderIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("countBySeverity", () => {
  it("counts per severity", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 2, SUGGESTION: 1 });
  });
});

describe("latestAgentFindings", () => {
  it("keeps only each agent's newest review (input newest-first)", () => {
    const rv = (id: string, agent_id: string | null, findings: FindingRecord[]) =>
      ({ id, agent_id, kind: "review", findings }) as unknown as ReviewRecord;
    const got = latestAgentFindings([
      rv("r3", "A", [mk("new", "WARNING")]),
      rv("r2", "B", [mk("b", "SUGGESTION")]),
      rv("r1", "A", [mk("old", "CRITICAL")]),
      rv("r0", null, [mk("x", "CRITICAL")]),
    ]);
    expect(got.map((f) => f.id)).toEqual(["new", "b", "x"]);
  });
});

describe("FindingsSummary", () => {
  it("renders one counter per non-zero level", () => {
    renderIntl(<FindingsSummary counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 }} findings={FINDINGS} />);
    expect(screen.getByLabelText("2 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Suggestion")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Warning/)).toBeNull();
  });

  it("renders nothing when every count is zero", () => {
    const { container } = renderIntl(<FindingsSummary counts={{ CRITICAL: 0 }} findings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the findings popover on hover and asks to load them", () => {
    let hovered = 0;
    const { rerender } = renderIntl(
      <FindingsSummary counts={{ CRITICAL: 2, SUGGESTION: 1 }} findings={undefined} onHover={() => hovered++} />,
    );
    fireEvent.mouseEnter(screen.getByLabelText("2 Critical").parentElement!);
    expect(hovered).toBe(1);
    expect(screen.getByText("Loading findings…")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsSummary counts={{ CRITICAL: 2, SUGGESTION: 1 }} findings={FINDINGS} inRun />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("3 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("title a")).toBeInTheDocument();
    expect(screen.getAllByText("src/a.ts:3-5")).toHaveLength(3);

    fireEvent.mouseLeave(screen.getByLabelText("2 Critical").parentElement!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
