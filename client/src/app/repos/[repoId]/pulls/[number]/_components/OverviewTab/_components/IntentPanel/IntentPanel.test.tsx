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

const usePrIntentSpy = vi.fn();
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: (...args: unknown[]) => {
    usePrIntentSpy(...args);
    return { ...current, refetch };
  },
  useRefreshIntent: () => ({ mutate: refreshMutate, isPending: refreshPending }),
  useSaveIntentOverride: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  current = IDLE;
  refreshPending = false;
  refetch.mockClear();
  refreshMutate.mockClear();
  usePrIntentSpy.mockClear();
});
afterEach(cleanup);

const renderPanel = (reviewRunning = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <IntentPanel prId={INTENT.pr_id} repoFullName="o/r" reviewRunning={reviewRunning} />
    </NextIntlClientProvider>,
  );

describe("IntentPanel", () => {
  it("shows nothing but a placeholder while loading", () => {
    current = { data: undefined, isLoading: true, isError: false };
    renderPanel();
    expect(screen.queryByText("Add rate limiting to the API.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recalculate" })).not.toBeInTheDocument();
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
    expect(screen.getByText("Intent not yet analysed")).toBeInTheDocument();
    expect(
      screen.getByText("Run review agents to analyse the intent and scope of this pull request."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run Intent" }));
    expect(refreshMutate).toHaveBeenCalledTimes(1);
  });

  it("shows that the intent is being analysed while a review runs, and polls for it", () => {
    current = { data: null, isLoading: false, isError: false };
    renderPanel(true);
    expect(screen.getByText("Analysing intent…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Intent" })).not.toBeInTheDocument();
    expect(usePrIntentSpy).toHaveBeenLastCalledWith(INTENT.pr_id, { live: true });
  });

  it("renders the intent and disables Recalculate while recalculating", () => {
    refreshPending = true;
    renderPanel();
    expect(screen.getByText("Add rate limiting to the API.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recalculating/i })).toBeDisabled();
  });
});
