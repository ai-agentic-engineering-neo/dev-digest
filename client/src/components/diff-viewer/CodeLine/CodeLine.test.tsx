/**
 * CodeLine — the finding card's open state must not freeze at mount (WP5 /
 * frontend-react-2-4): a finding arriving on a LATER render still opens its
 * card by default, but an explicit user collapse survives a later render.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import type { DiffFindingApi, InlineFindingCardProps } from "../findings";
import type { Line } from "../helpers";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { CodeLine } from "./CodeLine";

afterEach(cleanup);

function Card({ f }: InlineFindingCardProps) {
  return <div>{f.title}</div>;
}

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function findingApiFor(onAction: (id: string, a: FindingActionKind) => void = () => {}): DiffFindingApi {
  return { byFile: new Map(), Card, pending: false, onAction };
}

const LINE: Line = { kind: "ctx", text: "const x = 1;", oldNo: 1, newNo: 1 };

function tree(lineFindings: FindingRecord[], findingApi?: DiffFindingApi) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      <CodeLine ln={LINE} path="src/config.ts" threads={[]} lineFindings={lineFindings} findingApi={findingApi} />
    </NextIntlClientProvider>
  );
}

describe("CodeLine — finding card open state survives a later render", () => {
  it("a finding arriving on a later render opens its card (not frozen at mount)", () => {
    const { rerender } = render(tree([]));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    const withFinding = [finding({ id: "f1" })];
    rerender(tree(withFinding, findingApiFor()));

    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("collapsing the card, then a later render with the same findings, stays collapsed", () => {
    const findings = [finding({ id: "f1" })];
    const api = findingApiFor();
    const { rerender } = render(tree(findings, api));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.click(screen.getByText("blocker"));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    rerender(tree(findings, api));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});
