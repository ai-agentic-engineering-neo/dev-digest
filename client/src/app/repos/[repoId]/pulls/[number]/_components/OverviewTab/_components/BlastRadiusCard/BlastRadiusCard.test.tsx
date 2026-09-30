import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

let blastState: { data: BlastRadius | null | undefined; isLoading: boolean };
let historyState: { data: PrHistory | null | undefined };

vi.mock("../../../../../../../../../lib/hooks/blast-radius", () => ({
  useBlastRadius: () => blastState,
}));
vi.mock("../../../../../../../../../lib/hooks/pr-history", () => ({
  usePrHistory: () => historyState,
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/api/public.ts", kind: "function" },
    { name: "bucketKey", file: "src/api/public.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "handler", file: "src/api/index.ts", line: 23 },
        { name: "onWebhook", file: "src/api/webhooks.ts", line: 45 },
      ],
      endpoints_affected: ["GET /api/public/items", "POST /api/public/webhooks"],
      crons_affected: ["job:reset-rate-buckets"],
    },
    {
      symbol: "bucketKey",
      callers: [],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "2 changed symbols reach 2 callers across 2 files, touching 2 endpoints.",
};

function renderCard(prId: string | null = "pr-1") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <BlastRadiusCard prId={prId} repoFullName="acme/payments-api" headSha="a1b2c3d4" />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("renders a loading placeholder while the query is pending", () => {
    blastState = { data: undefined, isLoading: true };
    historyState = { data: undefined };
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
  });

  it("shows the empty state when there is no downstream impact", () => {
    blastState = {
      data: { changed_symbols: [], downstream: [], summary: "No symbols declared in the changed files." },
      isLoading: false,
    };
    historyState = { data: { history: [] } };
    renderCard();
    expect(screen.getByText(/No downstream impact detected/)).toBeInTheDocument();
  });

  it("renders one row per symbol and independently expands multiple at once", () => {
    blastState = { data: BLAST, isLoading: false };
    historyState = { data: { history: [] } };
    renderCard();

    expect(screen.getByText(BLAST.summary)).toBeInTheDocument();
    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
    expect(screen.getByText("bucketKey()")).toBeInTheDocument();

    // Nothing expanded yet.
    expect(screen.queryByText("handler")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("rateLimit()"));
    expect(screen.getByText("handler")).toBeInTheDocument();
    expect(screen.getByText("src/api/index.ts:23")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByText("job:reset-rate-buckets")).toBeInTheDocument();

    // The GitHub blob link is built from repoFullName/headSha/file/line.
    const link = screen.getByText("src/api/index.ts:23").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/a1b2c3d4/src/api/index.ts#L23",
    );

    // bucketKey expands INDEPENDENTLY — rateLimit's detail stays open too
    // (multi-expand, not a single-select accordion).
    fireEvent.click(screen.getByText("bucketKey()"));
    expect(screen.getByText("handler")).toBeInTheDocument();
    expect(screen.getByText(/No resolved callers/)).toBeInTheDocument();
  });

  it("switches to the Graph view and renders caller/endpoint nodes as an SVG diagram", () => {
    blastState = { data: BLAST, isLoading: false };
    historyState = { data: { history: [] } };
    const { container } = renderCard();

    fireEvent.click(screen.getByText("rateLimit()"));
    // Tree view is the default — no graph SVG yet.
    expect(container.querySelector('[data-testid="blast-radius-graph"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Graph"));
    expect(container.querySelector('[data-testid="blast-radius-graph"]')).toBeInTheDocument();
    // Node labels: the symbol itself, its callers, and its endpoints/crons.
    expect(screen.getAllByText("rateLimit()").length).toBeGreaterThan(0);
    expect(screen.getByText("handler")).toBeInTheDocument();
    expect(screen.getByText("onWebhook")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();

    // Tree toggle switches back.
    fireEvent.click(screen.getByText("Tree"));
    expect(container.querySelector('[data-testid="blast-radius-graph"]')).not.toBeInTheDocument();
  });

  it("Callers tab flattens every resolved caller across every symbol, tagged with which symbol it calls", () => {
    blastState = { data: BLAST, isLoading: false };
    historyState = { data: { history: [] } };
    renderCard();

    fireEvent.click(screen.getByTestId("blast-tab-callers"));
    expect(screen.getByText("src/api/index.ts:23")).toBeInTheDocument();
    expect(screen.getByText("src/api/webhooks.ts:45")).toBeInTheDocument();
    expect(screen.getByText(/handler.*rateLimit/)).toBeInTheDocument();
    // Symbol rows are gone — this is the flat caller list, not the tree.
    expect(screen.queryByText("rateLimit()")).not.toBeInTheDocument();
  });

  it("Endpoints tab flattens every impacted endpoint/cron across every symbol, deduped", () => {
    blastState = { data: BLAST, isLoading: false };
    historyState = { data: { history: [] } };
    renderCard();

    fireEvent.click(screen.getByTestId("blast-tab-endpoints"));
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByText("POST /api/public/webhooks")).toBeInTheDocument();
    expect(screen.getByText("job:reset-rate-buckets")).toBeInTheDocument();
  });

  it("shows the Tree/Graph toggle only on the Symbols tab, and hides the Prior PRs section when there is no overlap", () => {
    blastState = { data: BLAST, isLoading: false };
    historyState = { data: { history: [] } };
    renderCard();

    expect(screen.getByText("Graph")).toBeInTheDocument(); // Symbols tab is the default
    fireEvent.click(screen.getByTestId("blast-tab-callers"));
    expect(screen.queryByText("Graph")).not.toBeInTheDocument();

    expect(screen.queryByText(/Prior PRs/)).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — Prior PRs section", () => {
  const HISTORY: PrHistory = {
    history: [
      {
        pr_number: 5,
        title: "Add rate limit config",
        merged_at: "2026-08-01T00:00:00.000Z",
        author: "marisa.koch",
        files_overlap: ["src/api/public.ts"],
        notes: "Touched 1 of 1 changed files in this PR.",
      },
    ],
  };

  it("is collapsed by default and expands on click to show prior PR details", () => {
    blastState = { data: BLAST, isLoading: false };
    historyState = { data: HISTORY };
    renderCard();

    expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // count badge
    expect(screen.queryByText("Add rate limit config")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Prior PRs touching these files"));
    expect(screen.getByText("Add rate limit config")).toBeInTheDocument();
    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByText(/marisa.koch/)).toBeInTheDocument();
  });

  it("renders nothing when there is no prior-PR overlap", () => {
    blastState = { data: BLAST, isLoading: false };
    historyState = { data: { history: [] } };
    renderCard();
    expect(screen.queryByText(/Prior PRs/)).not.toBeInTheDocument();
  });
});
