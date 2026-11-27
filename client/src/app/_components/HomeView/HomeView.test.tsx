import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/common.json";
import { ApiError } from "@/lib/api";
import { HomeView } from "./HomeView";

/** A failed repo fetch must surface as an error, not as the "no repos" onboarding. */

const replace = vi.fn();
let reposState: Record<string, unknown> = {};
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/lib/hooks", () => ({ useRepos: () => reposState }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/page-shell", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common: messages }}>
      <HomeView />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  replace.mockReset();
});

describe("HomeView", () => {
  it("shows the API error (not the empty state) when repos fail to load", () => {
    reposState = {
      isLoading: false,
      isError: true,
      error: new ApiError("Cannot reach the DevDigest engine at http://localhost:3101.", 0, "network_error"),
      refetch: vi.fn(),
    };
    renderView();
    expect(screen.getByText(messages.home.errorTitle)).toBeInTheDocument();
    expect(screen.getByText(/localhost:3101/)).toBeInTheDocument();
    expect(screen.queryByText(messages.home.emptyTitle)).not.toBeInTheDocument();
  });

  it("shows onboarding when the API returns no repos", () => {
    reposState = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    renderView();
    expect(screen.getByText(messages.home.emptyTitle)).toBeInTheDocument();
  });
});
