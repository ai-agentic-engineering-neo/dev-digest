import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ConventionCandidate, ConventionList, Repo } from "@devdigest/shared";
import { mockApi, renderWithProviders } from "@/test/render";
import { ConventionsView } from "./ConventionsView";

const repo = { id: "r1", full_name: "acme/quick-blog", default_branch: "main" } as Repo;

const candidate = (id: string, rule: string, path: string): ConventionCandidate => ({
  id,
  category: "api layer",
  rule,
  evidence_path: path,
  evidence_snippet: "export { default as axios } from './axiosConfig'",
  evidence_start_line: 1,
  evidence_end_line: 1,
  confidence: 0.5,
  status: "pending",
  accepted: false,
});

const SCANNED: ConventionList = {
  candidates: [
    candidate("00000000-0000-4000-8000-000000000001", "HTTP goes through the shared axios instance", "client/src/api/index.js"),
    candidate("00000000-0000-4000-8000-000000000002", "401 clears the token and redirects", "client/src/api/axiosConfig.js"),
  ],
  sample_count: 12,
  last_scan_at: new Date().toISOString(),
};

describe("ConventionsView", () => {
  it("runs an extraction, accepts one candidate and builds a skill from it only", async () => {
    let list: ConventionList = { candidates: [], sample_count: null, last_scan_at: null };
    const calls = mockApi((method, path, body) => {
      if (method === "GET" && path === "/repos/r1/conventions") return list;
      if (method === "POST" && path === "/repos/r1/conventions/extract") return (list = SCANNED);
      if (method === "PATCH") {
        const id = path.split("/").at(-1);
        const status = (body as { status: ConventionCandidate["status"] }).status;
        list = {
          ...list,
          candidates: list.candidates.map((c) => (c.id === id ? { ...c, status, accepted: status === "accepted" } : c)),
        };
        return list.candidates.find((c) => c.id === id);
      }
      if (method === "POST" && path === "/repos/r1/conventions/skill") return { id: "sk1", name: "repo-conventions" };
      return {};
    });
    renderWithProviders(<ConventionsView repoId="r1" repo={repo} />);

    fireEvent.click(await screen.findByRole("button", { name: "Run extraction" }));
    const first = await screen.findByRole("article", { name: SCANNED.candidates[0]!.rule });
    expect(within(first).getByRole("link", { name: /Open client\/src\/api\/index\.js:1 on GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/quick-blog/blob/main/client/src/api/index.js#L1",
    );
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();

    fireEvent.click(within(first).getByRole("button", { name: "Accept" }));
    const second = screen.getByRole("article", { name: SCANNED.candidates[1]!.rule });
    fireEvent.click(within(second).getByRole("button", { name: "Reject" }));
    await screen.findByText("1 of 2 accepted");

    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(calls.some((c) => c.path === "/repos/r1/conventions/skill")).toBe(true));
    const sent = calls.find((c) => c.path === "/repos/r1/conventions/skill")!.body as {
      name: string;
      body: string;
      enabled: boolean;
      convention_ids: string[];
    };
    expect(sent.name).toBe("repo-conventions");
    expect(sent.enabled).toBe(false);
    expect(sent.convention_ids).toEqual([SCANNED.candidates[0]!.id]);
    expect(sent.body).toContain("HTTP goes through the shared axios instance");
    expect(sent.body).not.toContain("401 clears the token");
    expect(await screen.findByText("Skill repo-conventions created.")).toBeInTheDocument();
  });
});
