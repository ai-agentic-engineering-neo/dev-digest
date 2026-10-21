import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/context" }));
vi.mock("./hooks", () => ({ useRepos: () => ({ data: [], isSuccess: true }) }));

import { RepoProvider, useActiveRepo, useRepoChangeGuard, type RepoChangeGuard } from "./repo-context";

const proceed = vi.fn();
let held: (() => void) | null = null;
const guard: RepoChangeGuard = (go) => {
  held = go; // the page asks the user; it resumes later
};

function Probe({ guarded }: { guarded: boolean }) {
  useRepoChangeGuard(guarded ? guard : null);
  const { requestRepoChange } = useActiveRepo();
  return <button onClick={() => requestRepoChange("r2", proceed)}>switch</button>;
}

afterEach(() => {
  cleanup();
  proceed.mockReset();
  held = null;
});

describe("repo change guard (AC-67)", () => {
  it("runs the change at once with no guard, holds it with one until resumed, and drops the guard on unmount", () => {
    const { rerender } = render(
      <RepoProvider>
        <Probe guarded={false} />
      </RepoProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(proceed).toHaveBeenCalledTimes(1);

    rerender(
      <RepoProvider>
        <Probe guarded />
      </RepoProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(proceed).toHaveBeenCalledTimes(1); // vetoed
    held!(); // user confirmed Discard
    expect(proceed).toHaveBeenCalledTimes(2);

    function After() {
      const { requestRepoChange } = useActiveRepo();
      return <button onClick={() => requestRepoChange("r2", proceed)}>after</button>;
    }
    rerender(
      <RepoProvider>
        <After />
      </RepoProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "after" }));
    expect(proceed).toHaveBeenCalledTimes(3); // guard gone with its page
  });
});
