import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";

const { replace, nav } = vi.hoisted(() => ({
  replace: vi.fn(),
  nav: { search: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ replace }),
  useSearchParams: () => nav.search,
}));
vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => ({
    data: [
      { number: 1, title: "older", status: "needs_review", updated_at: "2026-01-01T00:00:00Z" },
      { number: 2, title: "newer", status: "needs_review", updated_at: "2026-06-01T00:00:00Z" },
    ],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRefreshRepo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../PRRow", () => ({
  PRRow: ({ pr }: { pr: { title: string } }) => <div data-testid="row">{pr.title}</div>,
}));

import { PullsView } from "./PullsView";

afterEach(() => {
  cleanup();
  replace.mockReset();
  nav.search = new URLSearchParams();
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PullsView />
    </NextIntlClientProvider>,
  );
}
const rowTitles = () => screen.getAllByTestId("row").map((el) => el.textContent);

describe("PullsView sort (URL state)", () => {
  it("defaults to newest first with no sort param", () => {
    renderView();
    expect(rowTitles()).toEqual(["newer", "older"]);
  });

  it("reads ?sort=oldest from the URL", () => {
    nav.search = new URLSearchParams("status=needs_review&sort=oldest");
    renderView();
    expect(rowTitles()).toEqual(["older", "newer"]);
  });

  it("writes the sort into the URL, and drops it for the default", () => {
    nav.search = new URLSearchParams("status=all");
    renderView();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "oldest" } });
    expect(replace).toHaveBeenLastCalledWith("/repos/r1/pulls?status=all&sort=oldest");

    cleanup();
    nav.search = new URLSearchParams("status=all&sort=oldest");
    renderView();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "newest" } });
    expect(replace).toHaveBeenLastCalledWith("/repos/r1/pulls?status=all");
  });
});
