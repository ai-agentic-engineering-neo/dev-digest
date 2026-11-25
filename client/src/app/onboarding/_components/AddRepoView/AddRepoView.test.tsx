import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../messages/en/addRepo.json";
import { AddRepoView } from "./AddRepoView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
});

function renderView() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ addRepo: messages }}>
        <AddRepoView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AddRepoView", () => {
  it("renders the translated heading, intro and settings link", () => {
    renderView();
    // e2e flow 06-onboarding waits for this exact heading.
    expect(screen.getByRole("heading", { name: "Add a repository" })).toBeInTheDocument();
    expect(screen.getByText(/Paste a GitHub repository URL/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute(
      "href",
      "/settings/api-keys",
    );
    expect(screen.getByPlaceholderText("https://github.com/owner/repo")).toBeInTheDocument();
  });

  it("keeps the submit button disabled until a URL is typed", () => {
    renderView();
    const submit = screen.getByRole("button", { name: /Add repository/ });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/acme/payments-api" },
    });
    expect(submit).toBeEnabled();
  });

  it("closes on Escape", () => {
    renderView();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/");
  });
});
