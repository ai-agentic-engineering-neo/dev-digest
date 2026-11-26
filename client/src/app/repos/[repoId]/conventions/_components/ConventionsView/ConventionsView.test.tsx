import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import {
  REPO_ID,
  fetchCalls,
  makeCandidate,
  makePage,
  mockFetch,
  renderWithProviders,
} from "../../test-utils";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "11111111-1111-4111-8111-111111111111" }),
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}));
// The real shell needs repo context, theme and pulls; only its children matter here.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <p>repo-not-found</p> }));
const repo = vi.hoisted(() => ({ notFound: false }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: { id: "11111111-1111-4111-8111-111111111111", full_name: "acme/payments-api" },
  }),
  useRepoNotFound: () => repo.notFound,
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  nav.push.mockReset();
  repo.notFound = false;
  vi.unstubAllGlobals();
});

const LIST = `GET /repos/${REPO_ID}/conventions`;
const SCAN = `POST /repos/${REPO_ID}/conventions/scan`;

const pending = makeCandidate({ id: "p1", rule: "Pending rule" });
const accepted = makeCandidate({ id: "a1", rule: "Accepted rule", status: "accepted", accepted: true });
const inSkill = makeCandidate({
  id: "a2",
  rule: "Already in skill",
  status: "accepted",
  accepted: true,
  skill_names: ["payments-api-conventions"],
});
const rejected = makeCandidate({ id: "r1", rule: "Rejected rule", status: "rejected" });

describe("ConventionsView", () => {
  it("before any scan: empty state with Run extraction, which scans and shows the cards", async () => {
    const spy = mockFetch({
      [LIST]: { scan: null, candidates: [] },
      [SCAN]: { ...makePage([pending]), proposed: 1, kept: 1, dropped_ungrounded: 0, dropped_duplicate: 0 },
    });
    renderWithProviders(<ConventionsView />);

    expect(await screen.findByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Conventions in payments-api");
    fireEvent.click(screen.getByRole("button", { name: "Run extraction" }));

    expect(await screen.findByText("Pending rule")).toBeInTheDocument();
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
    expect(screen.getByText(/Detected from 14 sample files/)).toBeInTheDocument();
    expect(fetchCalls(spy).map(([m, p]) => `${m} ${p}`)).toContain(SCAN);
  });

  it("header, counts and filters", async () => {
    mockFetch({ [LIST]: makePage([pending, accepted, inSkill, rejected]) });
    renderWithProviders(<ConventionsView />);

    expect(await screen.findByText("2 of 4 accepted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);

    // Filter chips render before the cards, so the first match is the chip.
    fireEvent.click(screen.getAllByRole("button", { name: /Rejected/ })[0]!);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Rejected rule")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Pending/ })[0]!);
    expect(screen.getByText("Pending rule")).toBeInTheDocument();
  });

  it("a scan that keeps nothing keeps the header and shows the nothing-found banner", async () => {
    const page = makePage([accepted]);
    mockFetch({
      [LIST]: page,
      [SCAN]: { ...page, proposed: 4, kept: 0, dropped_ungrounded: 3, dropped_duplicate: 1 },
    });
    renderWithProviders(<ConventionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Re-scan" }));

    // role=status is also the toast region, so find the banner by its title.
    const banner = (await screen.findByText("Nothing new found")).closest("[role=status]")!;
    expect(banner).toHaveTextContent("proposed 4, 3 dropped (no evidence in the files or low confidence), 1 already known");
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
    expect(screen.getByText("Accepted rule")).toBeInTheDocument();
  });

  it("a FIRST scan that keeps nothing hides the empty state and shows the banner with the real file count", async () => {
    const meta = { at: new Date().toISOString(), commit_sha: "abc1234", files_sampled: 9, model: "m" };
    mockFetch({
      [LIST]: { scan: null, candidates: [] },
      [SCAN]: { scan: meta, candidates: [], proposed: 2, kept: 0, dropped_ungrounded: 2, dropped_duplicate: 0 },
    });
    renderWithProviders(<ConventionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Run extraction" }));

    const banner = (await screen.findByText("Nothing new found")).closest("[role=status]")!;
    expect(banner).toHaveTextContent("Sampled 9 files");
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
    expect(screen.getByText(/Detected from 9 sample files/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
  });

  it("disables Re-scan while a scan is running", async () => {
    mockFetch({ [LIST]: makePage([accepted]) });
    // Keep the scan request pending; everything else goes through the route table.
    const routed = globalThis.fetch;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "POST" && url.endsWith("/conventions/scan") ? new Promise(() => {}) : routed(url, init),
    );
    renderWithProviders(<ConventionsView />);
    const rescan = await screen.findByRole("button", { name: "Re-scan" });
    fireEvent.click(rescan);
    await waitFor(() => expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled());
  });

  it("links each card to its own scan SHA", async () => {
    mockFetch({ [LIST]: makePage([makeCandidate({ id: "o1", rule: "Old rule", commit_sha: "oldsha" })]) });
    renderWithProviders(<ConventionsView />);
    const card = await screen.findByRole("article", { name: "Old rule" });
    expect(within(card).getAllByRole("link", { name: /GitHub/ })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/blob/oldsha/"),
    );
  });

  it("shows a 422 from the scan inline", async () => {
    mockFetch({
      [LIST]: { scan: null, candidates: [] },
      [SCAN]: () => ({ status: 422, body: { error: { code: "validation_error", message: "Repo is not indexed yet" } } }),
    });
    renderWithProviders(<ConventionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Run extraction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Repo is not indexed yet");
  });

  it("selection: accepted rules not in a skill are preselected; Create skill needs one", async () => {
    mockFetch({ [LIST]: makePage([pending, accepted, inSkill]) });
    renderWithProviders(<ConventionsView />);

    expect(await screen.findByText("1 accepted rule selected")).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Create skill" });
    expect(create).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 accepted rules selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("No accepted rule selected")).toBeInTheDocument();
    expect(create).toBeDisabled();

    const card = screen.getByRole("article", { name: "Accepted rule" });
    fireEvent.click(within(card).getByRole("checkbox"));
    expect(screen.getByText("1 accepted rule selected")).toBeInTheDocument();
  });

  it("accepting a rule PATCHes its status and updates the card", async () => {
    const spy = mockFetch({
      [LIST]: makePage([pending]),
      "PATCH /conventions/p1": { ...pending, status: "accepted", accepted: true },
    });
    renderWithProviders(<ConventionsView />);
    const card = await screen.findByRole("article", { name: "Pending rule" });
    fireEvent.click(within(card).getByRole("button", { name: "Accept" }));

    expect(await within(card).findByRole("button", { name: "Accepted" })).toBeInTheDocument();
    expect(fetchCalls(spy)).toContainEqual(["PATCH", "/conventions/p1", { status: "accepted" }]);
    expect(screen.getByText("1 of 1 accepted")).toBeInTheDocument();
  });

  it("opens the create modal with the selected ids, and the edit modal", async () => {
    const spy = mockFetch({
      [LIST]: makePage([accepted]),
      [`POST /repos/${REPO_ID}/conventions/skill-draft`]: {
        name: "payments-api-conventions",
        description: "d",
        body: "# payments-api-conventions",
        tokens: 10,
      },
      "GET /skills": [],
    });
    renderWithProviders(<ConventionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Create skill" }));
    expect(await screen.findByText("Create skill from conventions")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchCalls(spy)).toContainEqual([
        "POST",
        `/repos/${REPO_ID}/conventions/skill-draft`,
        { convention_ids: ["a1"] },
      ]),
    );
    cleanup();

    mockFetch({ [LIST]: makePage([accepted]) });
    renderWithProviders(<ConventionsView />);
    const card = await screen.findByRole("article", { name: "Accepted rule" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Edit convention")).toBeInTheDocument();
  });

  it("an unknown repo shows the repo-not-found state", async () => {
    repo.notFound = true;
    mockFetch({ [LIST]: { scan: null, candidates: [] } });
    renderWithProviders(<ConventionsView />);
    expect(screen.getByText("repo-not-found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});
