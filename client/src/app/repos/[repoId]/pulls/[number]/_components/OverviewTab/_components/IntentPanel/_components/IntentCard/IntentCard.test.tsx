import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/brief.json";
import type { IntentSource, PrIntent } from "@/lib/types";
import { IntentCard, type IntentCardActions } from "./IntentCard";

afterEach(cleanup);

const makeSource = (o: Partial<IntentSource> = {}): IntentSource => ({
  id: "src",
  kind: "pr_body",
  ref: "body",
  weight: "strong",
  status: "read",
  reason: null,
  used: true,
  cited: true,
  issue_number: null,
  path: null,
  ...o,
});

const makeIntent = (o: Partial<PrIntent> = {}): PrIntent => ({
  pr_id: "11111111-1111-4111-8111-111111111111",
  status: "ok",
  origin: "derived",
  intent: "Add rate limiting to the API.",
  in_scope: ["Limiter middleware"],
  out_of_scope: ["Auth changes"],
  kind: "feature",
  confidence: "high",
  confidence_reason: "substantive_body",
  confidence_lowered: false,
  sources: [],
  head_sha: "abcdef1234567",
  stale: false,
  stale_reason: null,
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 800,
  tokens_out: 140,
  cost_usd: 0.0002,
  error: null,
  updated_at: "2026-11-06T00:00:00Z",
  ...o,
});

const makeActions = (o: Partial<IntentCardActions> = {}): IntentCardActions => ({
  onRefresh: vi.fn(),
  onSaveOverride: vi.fn().mockResolvedValue(undefined),
  onResetOverride: vi.fn(),
  refreshing: false,
  saving: false,
  resetting: false,
  ...o,
});

function renderCard(intent: PrIntent, actions: IntentCardActions) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentCard intent={intent} repoFullName="acme/api" actions={actions} />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("shows a derived intent with scope lists and source chips", () => {
    renderCard(
      makeIntent({
        sources: [
          makeSource({ id: "i", kind: "issue", ref: "#12", issue_number: 12 }),
          makeSource({ id: "p", kind: "plan", ref: "plans/foo.md", path: "plans/foo.md" }),
          makeSource({ id: "nf", kind: "issue", ref: "#99", issue_number: 99, status: "unavailable", reason: "not_found" }),
          makeSource({ id: "ex", kind: "external_link", ref: "example.com", status: "skipped_external" }),
        ],
      }),
      makeActions(),
    );
    expect(screen.getByText("Add rate limiting to the API.")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Auth changes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Issue #12" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/issues/12",
    );
    expect(screen.getByText("plans/foo.md")).toBeInTheDocument();
    expect(screen.getByText(/missing or private/)).toBeInTheDocument();
    expect(screen.getByText(/external link — not fetched/)).toBeInTheDocument();
    expect(screen.getByText("computed for abcdef1")).toBeInTheDocument();
  });

  it("shows each confidence level and a hint for low confidence", () => {
    renderCard(makeIntent({ confidence: "low", confidence_reason: "indirect_only" }), makeActions());
    expect(screen.getByText("Low confidence").closest("[title]")).toHaveAttribute(
      "title",
      expect.stringContaining("Derived only from title, branch, commits and paths"),
    );
    cleanup();
    renderCard(makeIntent({ confidence: "medium" }), makeActions());
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    cleanup();
    renderCard(makeIntent({ confidence: "high" }), makeActions());
    expect(screen.getByText("High confidence")).toBeInTheDocument();
  });

  it("shows the stale notice and refreshes on click", () => {
    const actions = makeActions();
    renderCard(makeIntent({ stale: true, stale_reason: "head_moved" }), actions);
    expect(screen.getByRole("status")).toHaveTextContent("New commits since this intent was computed.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(actions.onRefresh).toHaveBeenCalledTimes(1);
    cleanup();
    renderCard(makeIntent(), makeActions({ refreshing: true }));
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  });

  it("edits the intent and closes the form after saving", async () => {
    const actions = makeActions();
    renderCard(makeIntent(), actions);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Intent"), { target: { value: "  New intent  " } });
    fireEvent.change(screen.getByLabelText("In scope (one per line)"), { target: { value: " a \n\n b " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(actions.onSaveOverride).toHaveBeenCalledWith({
        intent: "New intent",
        in_scope: ["a", "b"],
        out_of_scope: ["Auth changes"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
  });

  it("shows Edited and Reset for a user override, without Refresh", () => {
    const actions = makeActions();
    renderCard(makeIntent({ origin: "user" }), actions);
    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset to derived" }));
    expect(actions.onResetOverride).toHaveBeenCalledTimes(1);
  });

  it("hides empty scope lists", () => {
    renderCard(makeIntent({ in_scope: [], out_of_scope: [] }), makeActions());
    expect(screen.queryByText("In scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of scope")).not.toBeInTheDocument();
  });
});
