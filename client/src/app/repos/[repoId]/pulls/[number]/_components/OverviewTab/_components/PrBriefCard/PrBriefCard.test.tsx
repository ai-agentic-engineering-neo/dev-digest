import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefView } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { PrBriefCard } from "./PrBriefCard";

const BRIEF = {
  summary: "Adds a limiter. <b>not html</b>",
  risks: [],
  review_focus: [],
  generated_at: "2026-10-21T10:00:00.000Z",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 8190,
  tokens_out: 1300,
  cost_usd: 0.0021,
  head_sha: "h1",
  source_review_id: "r1",
  run_id: "brief-run",
  files_total: 9,
  files_included: 4,
};

const REVIEW = {
  review_id: "r1",
  run_id: "rv1",
  agent_name: "General Reviewer",
  verdict: "request_changes",
  score: 61,
  findings_count: 2,
  blockers: 1,
  created_at: new Date().toISOString(),
};

const RUN = {
  run_id: "brief-run",
  kind: "brief",
  agent_id: null,
  agent_name: null,
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  status: "done",
  error: null,
  duration_ms: 6000,
  tokens_in: 8190,
  tokens_out: 1300,
  cost_usd: 0.0021,
  findings_count: 0,
  grounding: null,
  ran_at: new Date().toISOString(),
  score: null,
  blockers: null,
};

const view = (o: Partial<PrBriefView> = {}) =>
  ({ brief: BRIEF, review: REVIEW, run: RUN, stale: false, ...o }) as unknown as PrBriefView;

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

/** GET /pulls/:id/brief, GET /settings and POST generate, all answered from `state`. */
function serve(state: { view: PrBriefView; settings?: unknown }) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/settings")) return json(state.settings ?? { feature_models: {} });
    if (init?.method === "POST") return json({ run: { ...RUN, status: "running" } }, 202);
    return json(state.view);
  });
}

function renderCard(onOpenTrace = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
        <PrBriefCard prId="p1" onOpenTrace={onOpenTrace} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { qc, onOpenTrace };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PrBriefCard", () => {
  it("shows the review's verdict, score and counts, the plain-text summary and the cost line that opens the run", async () => {
    serve({ view: view() });
    const user = userEvent.setup();
    const { onOpenTrace } = renderCard();

    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("2 findings · 1 blocker")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("Adds a limiter. <b>not html</b>")).toBeInTheDocument();
    expect(screen.getByText("Based on 4 of 9 files")).toBeInTheDocument();
    expect(screen.queryByText("Out of date")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Brief cost and tokens/ }));
    expect(onOpenTrace).toHaveBeenCalledWith("brief-run");

    // (i) opens on focus and names the agent, the review time and the brief model.
    await user.tab();
    await user.tab();
    await user.click(screen.getByRole("button", { name: "About this verdict" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("General Reviewer");
    expect(screen.getByRole("tooltip")).toHaveTextContent("openrouter/deepseek/deepseek-v4-flash");
  });

  it("omits the blocker part of the counts badge when the review has no blockers", async () => {
    serve({ view: view({ review: { ...REVIEW, findings_count: 1, blockers: 0 } as PrBriefView["review"] }) });
    renderCard();
    expect(await screen.findByText("1 finding")).toBeInTheDocument();
    expect(screen.queryByText(/blocker/)).not.toBeInTheDocument();
  });

  it("shows a neutral tile with no ring or badge when never reviewed, and an Out of date badge when stale", async () => {
    serve({ view: view({ review: null, stale: true }) });
    renderCard();
    expect(await screen.findByText("Not reviewed yet")).toBeInTheDocument();
    expect(screen.getByText("Out of date")).toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings?$/)).not.toBeInTheDocument();
  });

  it("with no brief offers Generate naming the workspace model, starts a run and keeps the button disabled while it runs", async () => {
    serve({
      view: view({ brief: null, review: null, run: null }),
      settings: { feature_models: { risk_brief: { provider: "openai", model: "gpt-x" } } },
    });
    const user = userEvent.setup();
    renderCard();

    const btn = await screen.findByRole("button", { name: "Generate brief" });
    await waitFor(() => expect(btn).toHaveAttribute("title", expect.stringContaining("openai/gpt-x")));
    serve({ view: view({ brief: null, review: null, run: { ...RUN, status: "running" } as never }) });
    await user.click(btn);
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(String(post![0])).toContain("/pulls/p1/brief/generate");
    expect(await screen.findByRole("button", { name: "Writing the brief…" })).toBeDisabled();
  });

  it("keeps the previous brief and shows the failure inline (no alert toast) when the last run failed", async () => {
    serve({ view: view({ run: { ...RUN, status: "failed", error: "The model returned an invalid brief" } as never }) });
    const user = userEvent.setup();
    renderCard();
    expect(await screen.findByText("Adds a limiter. <b>not html</b>")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The model returned an invalid brief");
    // The regenerate tooltip names the workspace feature model (registry default here).
    expect(screen.getByRole("button", { name: /Regenerate brief with openrouter\/deepseek\/deepseek-v4-flash/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Regenerate brief/ }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });

  // Regression: regenerating must not blank the card or offer a second run (AC-6, AC-7).
  it("keeps the stored brief visible with a busy marker and no regenerate button while a run is in flight", async () => {
    serve({ view: view({ run: { ...RUN, status: "running" } as never }) });
    renderCard();
    expect(await screen.findByText("Adds a limiter. <b>not html</b>")).toBeInTheDocument();
    expect(screen.getByText("Writing the brief…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Regenerate brief/ })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("shows an inline error with Retry when the GET fails", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/settings") ? json({ feature_models: {} }) : json({ error: { code: "x", message: "down" } }, 500),
    );
    renderCard();
    expect(await screen.findByText("Couldn't load the brief.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
