import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "@messages/en/common.json";
import prReview from "@messages/en/prReview.json";

const state = { notFound: false };
vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/repo-context", () => ({ useRepoNotFound: () => state.notFound }));

import { RepoGuard } from "./RepoGuard";

const ui = () => (
  <NextIntlClientProvider locale="en" messages={{ common, prReview }}>
    <RepoGuard>
      <p>page body</p>
    </RepoGuard>
  </NextIntlClientProvider>
);

describe("RepoGuard", () => {
  it("renders the page for a known repo", () => {
    state.notFound = false;
    render(ui());
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("replaces the page with the empty state for an unknown repo", () => {
    state.notFound = true;
    render(ui());
    expect(screen.queryByText("page body")).toBeNull();
    expect(screen.getByText(common.repoNotFound.title)).toBeTruthy();
  });
});
