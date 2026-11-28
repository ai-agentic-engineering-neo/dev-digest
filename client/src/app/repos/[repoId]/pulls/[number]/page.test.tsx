import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => ({
  trace: "r1" as string | null,
  active: [{ run_id: "r1" }] as { run_id: string }[],
  invalidate: vi.fn(),
  drawerProps: [] as Record<string, unknown>[],
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo", number: "7" }),
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.trace ? `trace=${h.trace}` : ""),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidate }) as unknown as QueryClient,
}));
vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./_components/PrDetailHeader", () => ({ PrDetailHeader: () => null }));
vi.mock("./_components/OverviewTab", () => ({ OverviewTab: () => null }));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/DiffTab", () => ({ DiffTab: () => null }));
vi.mock("./_components/RunTraceDrawer", () => ({
  default: (p: Record<string, unknown>) => {
    h.drawerProps.push(p);
    return null;
  },
}));
vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr1", number: 7 }], isLoading: false }),
  usePullDetail: () => ({
    data: { number: 7, body: "", commits: [], files: [], files_count: 0, head_sha: "x", status: "open" },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  usePrActiveRuns: () => ({ data: h.active }),
  usePrRuns: () => ({ data: [] }),
  useCancelRun: () => ({}),
  useDeleteRun: () => ({ mutate: vi.fn() }),
  useRefreshPrRuns: () => vi.fn(),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));

import PRDetailPage from "./page";

afterEach(() => {
  cleanup();
  h.drawerProps.length = 0;
  h.invalidate.mockClear();
  h.active = [{ run_id: "r1" }];
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
    {children}
  </NextIntlClientProvider>
);

describe("PR detail page trace drawer", () => {
  it("opens the drawer live for an active run", () => {
    render(<PRDetailPage />, { wrapper });
    expect(h.drawerProps.at(-1)).toMatchObject({ runId: "r1", running: true });
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("invalidates the run trace when the run ends", async () => {
    const { rerender } = render(<PRDetailPage />, { wrapper });
    h.active = [];
    rerender(<PRDetailPage />);
    await waitFor(() =>
      expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["run-trace", "r1"] }),
    );
    expect(h.drawerProps.at(-1)).toMatchObject({ running: false });
  });
});
