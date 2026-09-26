import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "@messages/en/prReview.json";
import { IntentCard, type IntentCardProps } from "./IntentCard";

afterEach(cleanup);

function renderWithIntl(props: IntentCardProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard {...props} />
    </NextIntlClientProvider>,
  );
}

const RECORD: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Add pagination to the pull list",
  in_scope: ["Add a page query param", "Add Prev/Next controls"],
  out_of_scope: ["Rewriting the PR list styling"],
  confidence: "high",
  sources: [
    { kind: "description", ref: "", status: "ok", chars: 120 },
    { kind: "web", ref: "example.com/readme", status: "unavailable", chars: 0 },
  ],
  missing_context: ["The linked spec doc could not be fetched"],
  head_sha: "old-sha",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 500,
  tokens_out: 80,
  updated_at: "2026-09-25T00:00:00.000Z",
};

describe("IntentCard", () => {
  it("shows the loaded intent, its scope, confidence, an unavailable source chip and the stale hint; Recompute calls back", () => {
    const onRecompute = vi.fn();
    // headSha differs from RECORD.head_sha ("old-sha"), so the record is stale.
    renderWithIntl({
      intent: RECORD,
      isLoading: false,
      isError: false,
      headSha: "new-sha",
      onRecompute,
      recomputing: false,
    });

    expect(screen.getByText(RECORD.intent)).toBeInTheDocument();
    expect(screen.getByText("Add a page query param")).toBeInTheDocument();
    expect(screen.getByText("Rewriting the PR list styling")).toBeInTheDocument();
    expect(screen.getByText("Confidence: High")).toBeInTheDocument();
    expect(screen.getByText("PR updated — intent stale")).toBeInTheDocument();
    expect(screen.getByText(/Web page: example\.com\/readme/)).toBeInTheDocument();
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(screen.getByText("The linked spec doc could not be fetched")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
    expect(onRecompute).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when no intent is stored yet; Compute calls back", () => {
    const onRecompute = vi.fn();
    renderWithIntl({
      intent: null,
      isLoading: false,
      isError: false,
      headSha: "sha-1",
      onRecompute,
      recomputing: false,
    });

    expect(screen.getByText("Intent not derived yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compute" }));
    expect(onRecompute).toHaveBeenCalledTimes(1);
  });

  it("shows the error state with a retry that calls back", () => {
    const onRecompute = vi.fn();
    renderWithIntl({
      intent: undefined,
      isLoading: false,
      isError: true,
      headSha: "sha-1",
      onRecompute,
      recomputing: false,
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Couldn’t load the intent")).toBeInTheDocument();
    // ErrorState's Retry label is hardcoded English in the vendored kit (accepted deviation).
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRecompute).toHaveBeenCalledTimes(1);
  });
});
