import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import type { DiffFindingApi } from "../findings";
import type { DiffCommentApi } from "../comments";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/config.ts",
  additions: 2,
  deletions: 1,
  patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
};

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "Suspicious constant",
    file: "src/config.ts",
    start_line: 3,
    end_line: 3,
    rationale: "This value looks hardcoded.",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function renderCard(api: DiffFindingApi) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={FILE} findings={api} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard findings", () => {
  it("shows dot, severity tag and card under the line; Accept fires onAction", async () => {
      const onAction = vi.fn();
    renderCard({
      findings: [finding({})],
      flaggedPaths: new Set(["src/config.ts"]),
      onAction,
    });

    expect(screen.getByRole("img", { name: "Has review findings" })).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    // card sits in the same row wrapper as the added line it targets
    const row = screen.getByText("const c = 4;").closest("div")!.parentElement!;
    expect(within(row).getByText("Suspicious constant")).toBeInTheDocument();
    expect(within(row).getByText("This value looks hardcoded.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onAction).toHaveBeenCalledWith("f1", "accept");
  });

  it("lists a finding on a line outside the patch in the off-diff block", () => {
    renderCard({
      findings: [finding({ id: "f2", title: "Far away issue", start_line: 99, end_line: 99 })],
      flaggedPaths: new Set(["src/config.ts"]),
      onAction: vi.fn(),
    });
    expect(screen.getByText("Findings outside the shown lines")).toBeInTheDocument();
    expect(screen.getByText("Far away issue")).toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
  });

  it("hides inline and off-diff findings with the comments toggle, keeps the dot", () => {
    const commenting: DiffCommentApi = {
      comments: [],
      canComment: false,
      showComments: false,
      posting: false,
      onSubmit: vi.fn(),
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <FileCard
          file={FILE}
          commenting={commenting}
          findings={{
            findings: [finding({}), finding({ id: "f2", title: "Far away issue", start_line: 99, end_line: 99 })],
            flaggedPaths: new Set(["src/config.ts"]),
            onAction: vi.fn(),
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("img", { name: "Has review findings" })).toBeInTheDocument();
    expect(screen.queryByText("Suspicious constant")).not.toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
    expect(screen.queryByText("Far away issue")).not.toBeInTheDocument();
  });
});
