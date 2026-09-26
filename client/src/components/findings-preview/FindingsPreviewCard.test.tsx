import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "@messages/en/prReview.json";
import { FindingsPreviewCard } from "./FindingsPreviewCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const finding = (over: Partial<FindingRecord> & { id: string }): FindingRecord =>
  ({
    severity: "WARNING",
    category: "bug",
    title: `finding ${over.id}`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why it matters",
    confidence: 0.5,
    review_id: "rev",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  }) as FindingRecord;

describe("FindingsPreviewCard", () => {
  it("shows at most five findings and summarises the rest", () => {
    const findings = Array.from({ length: 7 }, (_, i) => finding({ id: `f${i}` }));
    renderWithIntl(<FindingsPreviewCard findings={findings} title="7 findings" top={0} left={0} />);

    expect(screen.getAllByText(/^finding f/)).toHaveLength(5);
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("omits the summary line when everything fits", () => {
    renderWithIntl(
      <FindingsPreviewCard
        findings={[finding({ id: "a" }), finding({ id: "b" })]}
        title="2 findings"
        top={0}
        left={0}
      />,
    );
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it("counts the hidden rest from `total`, not from what it was handed", () => {
    // The PR list knows the PR's real total from its own payload; the findings
    // themselves arrive from a separate, lazier request.
    renderWithIntl(
      <FindingsPreviewCard findings={[finding({ id: "a" })]} total={9} title="9 findings" top={0} left={0} />,
    );
    expect(screen.getByText("+8 more")).toBeInTheDocument();
  });

  it("renders file:line, confidence and the rationale of each finding", () => {
    renderWithIntl(
      <FindingsPreviewCard
        findings={[
          finding({ id: "a", file: "src/api/users.ts", start_line: 45, end_line: 52, confidence: 0.86 }),
        ]}
        title="1 findings"
        top={0}
        left={0}
      />,
    );
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(screen.getByText("86% conf")).toBeInTheDocument();
    expect(screen.getByText("why it matters")).toBeInTheDocument();
  });

  it("says it is loading while the findings are still in flight", () => {
    renderWithIntl(<FindingsPreviewCard findings={[]} total={3} title="3 findings" loading top={0} left={0} />);
    expect(screen.getByText("Loading findings…")).toBeInTheDocument();
  });
});
