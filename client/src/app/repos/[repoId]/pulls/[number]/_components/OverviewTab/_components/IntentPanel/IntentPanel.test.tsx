import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import type { PrIntent } from "@/lib/types";
import { IntentPanel } from "./IntentPanel";

const INTENT: PrIntent = {
  pr_id: "11111111-1111-4111-8111-111111111111",
  status: "ok",
  origin: "derived",
  intent: "Add rate limiting to the API.",
  in_scope: [],
  out_of_scope: [],
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
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.001,
  error: null,
  updated_at: "2026-11-06T00:00:00.000Z",
};

const refetch = vi.fn();
const refreshMutate = vi.fn();

interface QueryState {
  data: PrIntent | null | undefined;
  isLoading: boolean;
  isError: boolean;
}
const IDLE: QueryState = { data: INTENT, isLoading: false, isError: false };
let current: QueryState = IDLE;
let refreshPending = false;

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ ...current, refetch }),
  useRefreshIntent: () => ({ mutate: refreshMutate, isPending: refreshPending }),
  useSaveIntentOverride: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  current = IDLE;
  refreshPending = false;
  refetch.mockClear();
  refreshMutate.mockClear();
});
afterEach(cleanup);

const renderPanel = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentPanel prId={INTENT.pr_id} repoFullName="o/r" />
    </NextIntlClientProvider>,
  );

describe("IntentPanel", () => {
  it("shows nothing but a placeholder while loading", () => {
    current = { data: undefined, isLoading: true, isError: false };
    renderPanel();
    expect(screen.queryByText("Add rate limiting to the API.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("offers Retry on error", () => {
    current = { data: undefined, isLoading: false, isError: true };
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the intent");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("derives on demand from the empty state", () => {
    current = { data: null, isLoading: false, isError: false };
    renderPanel();
    expect(screen.getByText("No intent yet")).toBeInTheDocument();
    expect(screen.getByText("Intent is derived before the first review.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Derive now" }));
    expect(refreshMutate).toHaveBeenCalledTimes(1);
  });

  it("renders the intent and disables Refresh while refreshing", () => {
    refreshPending = true;
    renderPanel();
    expect(screen.getByText("Add rate limiting to the API.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refreshing/i })).toBeDisabled();
  });
});
