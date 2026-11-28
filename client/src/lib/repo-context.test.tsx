import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { Repo } from "./types";

let repoList: Repo[] | undefined;
vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
vi.mock("./hooks", () => ({
  useRepos: () => ({ data: repoList, isSuccess: repoList !== undefined }),
}));

import { RepoProvider, useActiveRepo } from "./repo-context";

const repo = (id: string) => ({ id, full_name: `o/${id}` }) as Repo;

function Probe() {
  const { repoId } = useActiveRepo();
  return <div data-testid="id">{repoId ?? "none"}</div>;
}

const renderProvider = () =>
  render(
    <RepoProvider>
      <Probe />
    </RepoProvider>,
  );

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("RepoProvider active repo", () => {
  it("keeps a stored id that is in the repo list", async () => {
    localStorage.setItem("dd-repo", "b");
    repoList = [repo("a"), repo("b")];
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("id")).toHaveTextContent("b"));
  });

  it("ignores a stored id missing from the list and clears it", async () => {
    localStorage.setItem("dd-repo", "gone");
    repoList = [repo("a")];
    renderProvider();
    await waitFor(() => expect(localStorage.getItem("dd-repo")).toBeNull());
    expect(screen.getByTestId("id")).toHaveTextContent("a");
  });

  it("clears the active repo once it is deleted from the list", async () => {
    localStorage.setItem("dd-repo", "b");
    repoList = [repo("a"), repo("b")];
    const { rerender } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("id")).toHaveTextContent("b"));
    repoList = [repo("a")];
    rerender(
      <RepoProvider>
        <Probe />
      </RepoProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("id")).toHaveTextContent("a"));
    expect(localStorage.getItem("dd-repo")).toBeNull();
  });
});
