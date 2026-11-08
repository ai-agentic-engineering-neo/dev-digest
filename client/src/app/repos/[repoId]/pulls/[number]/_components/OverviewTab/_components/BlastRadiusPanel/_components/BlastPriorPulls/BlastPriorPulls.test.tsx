import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import type { PriorPullsResponse } from "@/lib/types";
import { BlastPriorPulls, type PriorPullsQuery } from "./BlastPriorPulls";

const PR_ID = "11111111-1111-4111-8111-111111111111";
const DATA: PriorPullsResponse = {
  pr_id: PR_ID,
  total: 3,
  pulls: [
    {
      pr_id: "22222222-2222-4222-8222-222222222222",
      number: 41,
      title: "Rate-limit public API",
      author: "yana",
      status: "merged",
      updated_at: "2026-11-01T10:00:00.000Z",
      shared_count: 7,
      shared_files: ["src/a.ts", "src/b.ts"],
    },
    {
      pr_id: "33333333-3333-4333-8333-333333333333",
      number: 12,
      title: "Initial pricing",
      author: "dev",
      status: "open",
      updated_at: null,
      shared_count: 1,
      shared_files: ["src/a.ts"],
    },
  ],
};

let current: PriorPullsQuery;

function renderFooter() {
  render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastPriorPulls repoId="repo-1" query={current} />
    </NextIntlClientProvider>,
  );
}

const toggle = () => screen.getByRole("button", { name: /Prior PRs touching these files/ });

beforeEach(() => {
  current = { data: DATA, isLoading: false, isError: false };
});
afterEach(cleanup);

describe("BlastPriorPulls", () => {
  it("is a collapsed row with the total; expanding lists earlier PRs linked to their pages", () => {
    renderFooter();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAccessibleName(/3 prior PRs/);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list");
    const first = within(list).getByRole("link", { name: "#41 Rate-limit public API" });
    expect(first).toHaveAttribute("href", "/repos/repo-1/pulls/41");
    expect(within(list).getByText("yana · 7 shared files")).toHaveAttribute("title", "src/a.ts\nsrc/b.ts");
    expect(within(list).getByText("dev · 1 shared file")).toBeInTheDocument();
    // total 3, two listed
    expect(within(list).getByText("1 more earlier PR not shown.")).toBeInTheDocument();

    fireEvent.click(toggle());
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says so when no earlier PR touched the files, with nothing to expand", () => {
    current = { ...current, data: { pr_id: PR_ID, total: 0, pulls: [] } };
    renderFooter();
    expect(screen.getByText(messages.prior.empty)).toBeInTheDocument();
    expect(screen.getByText(messages.prior.title)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the title without a count or toggle while loading", () => {
    current = { data: undefined, isLoading: true, isError: false };
    renderFooter();
    expect(screen.getByText(messages.prior.title)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(messages.prior.empty)).not.toBeInTheDocument();
  });

  it("shows a quiet error instead of a count when the request fails", () => {
    current = { data: undefined, isLoading: false, isError: true };
    renderFooter();
    expect(screen.getByText(messages.prior.loadError)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
