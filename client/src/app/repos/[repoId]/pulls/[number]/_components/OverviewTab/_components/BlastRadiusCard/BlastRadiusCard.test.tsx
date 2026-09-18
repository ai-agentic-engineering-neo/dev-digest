import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import type { BlastRadius } from "@devdigest/shared";

let blastState: { data: BlastRadius | null | undefined; isLoading: boolean };

vi.mock("../../../../../../../../../lib/hooks/blast-radius", () => ({
  useBlastRadius: () => blastState,
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
    renderCard();
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
  });

  it("shows the empty state when there is no downstream impact", () => {
    blastState = {
      data: { changed_symbols: [], downstream: [], summary: "No symbols declared in the changed files." },
      isLoading: false,
    };
    renderCard();
    expect(screen.getByText(/No downstream impact detected/)).toBeInTheDocument();
  });

  it("renders summary chips and expands a symbol to show its callers and endpoints", () => {
    blastState = { data: BLAST, isLoading: false };
    renderCard();

    expect(screen.getByText(BLAST.summary)).toBeInTheDocument();
    expect(screen.getByText("rateLimit")).toBeInTheDocument();
    expect(screen.getByText("bucketKey")).toBeInTheDocument();

    // Nothing expanded yet.
    expect(screen.queryByText("handler")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("rateLimit"));
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

    // Switching to bucketKey shows its (empty) caller state instead.
    fireEvent.click(screen.getByText("bucketKey"));
    expect(screen.queryByText("handler")).not.toBeInTheDocument();
    expect(screen.getByText(/No resolved callers/)).toBeInTheDocument();
  });
});
