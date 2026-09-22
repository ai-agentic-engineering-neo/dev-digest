import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
import { mockFetch, jsonResponse } from "@/test/fetch-mock";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { AddRepoView } from "./AddRepoView";

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("AddRepoView", () => {
  it("renders its copy from the addRepo namespace, with the Settings link", () => {
    renderWithProviders(<AddRepoView />);
    expect(screen.getByRole("heading", { name: "Add a repository" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByText("esc")).toBeInTheDocument();
  });

  it("posts the trimmed URL and opens the new repo's PR list", async () => {
    const api = mockFetch({ "POST /repos": { id: "r9", full_name: "acme/api" } });
    const { user } = renderWithProviders(<AddRepoView />);
    await user.type(screen.getByPlaceholderText("https://github.com/owner/repo"), "  https://github.com/acme/api ");
    await user.click(screen.getByRole("button", { name: /Add repository/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/repos/r9/pulls"));
    expect(api.requests("POST", "/repos")[0]!.body).toEqual({ url: "https://github.com/acme/api" });
  });

  it("shows the API error inline when adding fails", async () => {
    mockFetch({ "POST /repos": jsonResponse({ error: { code: "bad_repo", message: "Repo not reachable" } }, 400) });
    const { user } = renderWithProviders(<AddRepoView />);
    await user.type(screen.getByPlaceholderText("https://github.com/owner/repo"), "https://github.com/x/y");
    await user.click(screen.getByRole("button", { name: /Add repository/ }));
    expect(await screen.findByText("Repo not reachable")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
