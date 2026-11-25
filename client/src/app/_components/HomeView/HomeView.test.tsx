import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import home from "../../../../messages/en/home.json";

const { replace, push, repos } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  repos: { current: { data: undefined as unknown, isLoading: false, isError: false } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
vi.mock("@/lib/hooks", () => ({ useRepos: () => repos.current }));
// The shell has its own data hooks; it isn't what this test is about.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { HomeView } from "./HomeView";

afterEach(() => {
  cleanup();
  replace.mockReset();
  push.mockReset();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ home }}>
      <HomeView />
    </NextIntlClientProvider>,
  );
}

describe("HomeView", () => {
  it("shows the empty state and links to onboarding when there are no repos", () => {
    repos.current = { data: [], isLoading: false, isError: false };
    renderView();
    expect(screen.getByText("Welcome to DevDigest")).toBeInTheDocument();
    expect(screen.getByText("No repositories yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(push).toHaveBeenCalledWith("/onboarding");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to the first repo's PR list when repos exist", () => {
    repos.current = { data: [{ id: "r1", full_name: "acme/payments-api" }], isLoading: false, isError: false };
    renderView();
    expect(replace).toHaveBeenCalledWith("/repos/r1/pulls");
    expect(screen.getByText("Open acme/payments-api")).toBeInTheDocument();
  });
});
