/**
 * FileCard — the same "open by default" freezing bug at the file level (WP5 /
 * frontend-react-2-4): a finding arriving on a LATER render still
 * auto-expands the file, and an explicit user collapse survives a later
 * render. The fixture file's additions+deletions exceed AUTO_EXPAND_MAX_LINES
 * (200) so the size-based auto-expand branch cannot by itself explain an open
 * card — only the findings-driven override can.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import type { DiffFindingApi, InlineFindingCardProps } from "../findings";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

function Card({ f }: InlineFindingCardProps) {
  return <div>{f.title}</div>;
}

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/big.ts",
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

function findingApiFor(byFile: Record<string, FindingRecord[]>): DiffFindingApi {
  return { byFile: new Map(Object.entries(byFile)), Card, pending: false, onAction: () => {} };
}

const BIG_FILE: PrFile = {
  path: "src/big.ts",
  additions: 150,
  deletions: 60,
  patch: "@@ -1,0 +1,1 @@\n+const x = 1;",
};

function tree(findings?: DiffFindingApi) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      <FileCard file={BIG_FILE} findings={findings} />
    </NextIntlClientProvider>
  );
}

describe("FileCard — auto-expand state survives a later render", () => {
  it("a finding arriving on a later render auto-expands a large file (not frozen at mount)", () => {
    const { rerender } = render(tree(findingApiFor({})));
    expect(screen.queryByText("const x = 1;")).not.toBeInTheDocument();

    rerender(tree(findingApiFor({ "src/big.ts": [finding({ id: "f1" })] })));

    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("collapsing the file, then a later render with the same findings, stays collapsed", () => {
    const findings = findingApiFor({ "src/big.ts": [finding({ id: "f1" })] });
    const { rerender } = render(tree(findings));
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();

    fireEvent.click(screen.getByText("src/big.ts"));
    expect(screen.queryByText("const x = 1;")).not.toBeInTheDocument();

    rerender(tree(findings));
    expect(screen.queryByText("const x = 1;")).not.toBeInTheDocument();
  });
});
