import type React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/intent.json";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import { IntentCard } from "./IntentCard";

const RECORD: PrIntentRecord = {
  pr_id: "p1",
  intent: "Protects the public API from abuse by adding a token-bucket rate limiter.",
  in_scope: ["Limiter middleware"],
  out_of_scope: ["Per-user quotas"],
  confidence: "medium",
  sources: [
    { kind: "title", ref: "title", status: "used", chars: 40 },
    { kind: "github_issue", ref: "#471", status: "used", chars: 640 },
    {
      kind: "external_url",
      ref: "https://docs.example.com/design",
      status: "skipped",
      reason: "external_fetch_disabled",
    },
  ],
  head_sha: "a1b2c3d4",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 1800,
  tokens_out: 140,
  cost_usd: 0.0003,
  duration_ms: 2400,
  derived_at: new Date().toISOString(),
  stale: false,
};

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

function renderCard(props: Partial<React.ComponentProps<typeof IntentCard>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ intent: messages, brief: briefMessages }}>
        <IntentCard prId="p1" repoFullName="acme/api" {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntentCard", () => {
  it("shows the intent, confidence, scope and sources, and refreshes on demand", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return json({ ...RECORD, intent: "Fresh intent after refresh.", confidence: "high" });
      }
      return json(RECORD);
    });
    renderCard();

    expect(await screen.findByText(/token-bucket rate limiter/)).toBeInTheDocument();
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    expect(screen.getByText("Limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Per-user quotas")).toBeInTheDocument();
    // Sources stay collapsed behind "Sources (3) · model · cost" until expanded.
    const toggle = screen.getByRole("button", { name: /Sources \(3\)/ });
    expect(toggle).toHaveTextContent("deepseek/deepseek-v4-flash · $0.0003");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "#471" })).not.toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "#471" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/issues/471",
    );
    expect(screen.getByText("https://docs.example.com/design")).toBeInTheDocument();
    expect(screen.getByText("external links are not fetched")).toBeInTheDocument();
    expect(screen.getByText(/derived now · 1940 tokens/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh intent" }));
    expect(await screen.findByText("“Fresh intent after refresh.”")).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(String(post![0])).toContain("/pulls/p1/intent/refresh");
  });

  it("shows Risk areas under the scope lists only when the brief has risks", async () => {
    fetchMock.mockImplementation(() => json(RECORD));
    const risks = [
      { kind: "auth", title: "Secret committed", explanation: "e", severity: "high", file_refs: ["src/config.ts:12"] },
    ] as never;
    const { unmount } = renderCard({ risks });
    expect(await screen.findByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
    unmount();
    renderCard();
    expect(await screen.findByText(/token-bucket rate limiter/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Risk areas" })).not.toBeInTheDocument();
  });

  it("flags a low-confidence, stale intent", async () => {
    fetchMock.mockImplementation(() => json({ ...RECORD, confidence: "low", stale: true }));
    renderCard();
    expect(await screen.findByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByTitle(/Treat it as a guess/)).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("renders an inline empty state on 404 and leaves refresh errors to the global toast", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json({ error: { code: "external_service_error", message: "provider down" } }, 502)
        : json({ error: { code: "not_found", message: "No intent" } }, 404),
    );
    renderCard();

    expect(await screen.findByText("No intent yet")).toBeInTheDocument();
    expect(screen.getByText("It is derived when a review runs.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(true),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
