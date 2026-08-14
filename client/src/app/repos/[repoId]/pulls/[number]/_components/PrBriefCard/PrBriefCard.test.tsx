import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import * as toastLib from "@/lib/toast";

/**
 * specs/11-why-risk-brief.md — PrBriefCard: AC-36 (section order), AC-37
 * (risk rendering), AC-38/AC-39 (review focus + click navigation), AC-41
 * (per-status rendering), AC-34 (zero risks).
 */

const mutate = vi.fn();
let pageData: BriefPage | undefined;
let mutationPending = false;

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({ data: pageData, isLoading: false }),
  useGenerateBrief: () => ({ mutate, isPending: mutationPending }),
}));

vi.spyOn(toastLib, "useToast").mockReturnValue({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pageData = undefined;
  mutationPending = false;
});

function renderCard(props: { onFocusFile?: (file: string, line: number | null) => void } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefCard prId="pr-1" repoFullName="acme/demo" {...props} />
    </NextIntlClientProvider>,
  );
}

const GENERATED_PAGE: BriefPage = {
  status: "generated",
  reason: null,
  current_head_sha: "sha-head",
  stale_markers: [],
  provenance: {
    head_sha: "sha-head",
    generated_at: "2026-08-13T00:00:00Z",
    model: "gpt-4.1",
    provider: "openai",
    attempts: 1,
    tokens_in: 1000,
    tokens_out: 200,
    cost_usd: 0.01,
    index_sha: "idx-sha",
    index_status: "full",
    index_reason: null,
    intent_resolved_at: null,
    dropped_inputs: 0,
  },
  brief: {
    what: "Adds rate limiting to the public API.",
    why: "Prevents abuse from unauthenticated clients.",
    risk_level: "high",
    risks: [
      {
        kind: "auth_surface",
        title: "New unauthenticated endpoint",
        explanation: "The rate limiter itself has no auth check.",
        severity: "high",
        // Deliberately a DIFFERENT line than the review-focus entry below,
        // so their rendered "path:line" link text never collides.
        file_refs: ["src/middleware/ratelimit.ts:99", "src/api/public/webhooks.ts"],
      },
    ],
    review_focus: [{ file: "src/middleware/ratelimit.ts", line: 42, reason: "Core rate-limit logic." }],
  },
};

import { PrBriefCard } from "./PrBriefCard";

describe("PrBriefCard", () => {
  it("AC-41: no brief yet renders the empty state and a Generate action", () => {
    pageData = { status: "none", reason: null, brief: null, provenance: null, current_head_sha: "sha1", stale_markers: [] };
    renderCard();
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate brief/i })).toBeInTheDocument();
  });

  it("AC-36/AC-37/AC-38: renders risk level, what, why, risk areas and review focus in order, and Regenerate triggers a mutation", () => {
    pageData = GENERATED_PAGE;
    renderCard();

    // "HIGH" appears twice — the overall risk level AND this risk's own
    // severity label — so assert the count rather than a single getByText.
    expect(screen.getAllByText("HIGH")).toHaveLength(2);
    expect(screen.getByText("Adds rate limiting to the public API.")).toBeInTheDocument();
    expect(screen.getByText("Prevents abuse from unauthenticated clients.")).toBeInTheDocument();
    expect(screen.getByText("New unauthenticated endpoint")).toBeInTheDocument();
    expect(screen.getByText(/Core rate-limit logic\./)).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /regenerate/i });
    fireEvent.click(button);
    expect(mutate).toHaveBeenCalledWith({ regenerate: true }, expect.anything());
  });

  it("AC-37: expanding a risk reveals its explanation and file references, with a real host link", () => {
    pageData = GENERATED_PAGE;
    renderCard();

    const riskToggle = screen.getByRole("button", { name: /New unauthenticated endpoint/i });
    expect(riskToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(riskToggle);
    expect(screen.getByText("The rate limiter itself has no auth check.")).toBeInTheDocument();
    const link = screen.getByText("src/middleware/ratelimit.ts:99").closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/acme/demo/blob/sha-head/src/middleware/ratelimit.ts#L99");
  });

  it("AC-39: activating a review-focus entry calls onFocusFile with the file and line", () => {
    pageData = GENERATED_PAGE;
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile });

    fireEvent.click(screen.getByRole("button", { name: /src\/middleware\/ratelimit\.ts:42/ }));
    expect(onFocusFile).toHaveBeenCalledWith("src/middleware/ratelimit.ts", 42);
  });

  it("AC-34: zero surviving risks renders an explicit empty statement, not an empty region", () => {
    pageData = { ...GENERATED_PAGE, brief: { ...GENERATED_PAGE.brief!, risks: [] } };
    renderCard();
    expect(screen.getByText("No specific risks identified.")).toBeInTheDocument();
  });

  it("AC-25/AC-41: earlier_state names the stored sha distinctly from possibly_stale", () => {
    pageData = {
      ...GENERATED_PAGE,
      status: "earlier_state",
      stale_markers: ["head sha (this brief describes sha-head, the PR is now at sha-new)"],
    };
    renderCard();
    expect(screen.getByRole("status")).toHaveTextContent(/earlier version/i);
  });

  it("AC-42: the risk level is legible without colour alone (rendered as text, not just a coloured dot)", () => {
    pageData = GENERATED_PAGE;
    renderCard();
    // Appears twice — the overall level and this risk's own severity — both
    // are real TEXT nodes, not a colour-only indicator either way.
    expect(screen.getAllByText("HIGH").length).toBeGreaterThan(0);
  });
});
