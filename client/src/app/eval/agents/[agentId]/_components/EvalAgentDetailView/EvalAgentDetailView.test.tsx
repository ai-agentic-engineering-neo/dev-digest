import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentDetail } from "@devdigest/shared/contracts/eval-ci";
import messages from "../../../../../../../messages/en/eval.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "agent-1" }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

let DETAIL: EvalAgentDetail | undefined;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalAgentDetail: () => ({ data: DETAIL, isLoading: false, isError: false, refetch: vi.fn() }),
  useEvalCompare: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { EvalAgentDetailView } from "./EvalAgentDetailView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("EvalAgentDetailView", () => {
  it("shows the no-cases empty state when the agent has no eval cases (AC-46)", () => {
    DETAIL = {
      agent_id: "agent-1",
      agent_name: "Security Reviewer",
      cases_total: 0,
      runs: [],
      current: null,
      delta: null,
      trend: [],
      callout: null,
    };
    renderWithIntl(<EvalAgentDetailView />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText(messages.empty.noCases)).toBeInTheDocument();
  });

  it("shows the one-run message when exactly one completed run exists, with no delta (AC-48)", () => {
    DETAIL = {
      agent_id: "agent-1",
      agent_name: "Security Reviewer",
      cases_total: 8,
      runs: [
        {
          id: "run-1",
          owner_kind: "agent",
          owner_id: "agent-1",
          agent_name: "Security Reviewer",
          status: "completed",
          started_at: "2026-01-01T00:00:00.000Z",
          finished_at: "2026-01-01T00:01:00.000Z",
          agent_version: 1,
          case_ids: ["c1"],
          metrics: {
            recall: 0.8,
            precision: 0.9,
            citation_accuracy: 1,
            traces_passed: 6,
            traces_total: 8,
            cases_errored: 0,
            duration_ms: 1000,
            cost_usd: 0.05,
            per_case: [],
          },
          duration_ms: 1000,
          cost_usd: 0.05,
          error_reason: null,
        },
      ],
      current: {
        recall: 0.8,
        precision: 0.9,
        citation_accuracy: 1,
        traces_passed: 6,
        traces_total: 8,
        cases_errored: 0,
        duration_ms: 1000,
        cost_usd: 0.05,
        per_case: [],
      },
      delta: null,
      trend: [],
      callout: null,
    };
    renderWithIntl(<EvalAgentDetailView />);
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0);
    expect(screen.getByText(messages.empty.oneRun)).toBeInTheDocument();
  });
});
