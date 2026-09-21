import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import type { ConventionExtractResult } from "@devdigest/shared";
import { REPO_ID, bodyOf, candidate, mockFetch, renderWithProviders } from "../../_test/harness";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "repo-1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LIST = `GET /repos/${REPO_ID}/conventions`;
const EXTRACT = `POST /repos/${REPO_ID}/conventions/extract`;
const DRAFT = `GET /repos/${REPO_ID}/conventions/skill-draft`;
const SAVE = `POST /repos/${REPO_ID}/conventions/skill`;

const A = candidate({ id: "a", rule: "Throw NotFoundError for a missing row", confidence: 0.9 });
const B = candidate({
  id: "b",
  rule: "Relative imports omit the file extension",
  category: "imports",
  confidence: 0.7,
  occurrences: 1,
  evidence_files: ["src/api/users.ts"],
});

const SCAN: ConventionExtractResult = {
  candidates: [A, B],
  sampled_files: ["package.json", "src/api/users.ts", "src/api/orders.ts"],
  proposed: 5,
  dropped_ungrounded: 2,
  dropped_duplicate: 1,
  model: "z-ai/glm-4.7-flash",
  cost_usd: 0.001,
};

describe("ConventionsView", () => {
  it("before any scan: heading, Run Scan (and no ReScan / Create skill)", async () => {
    mockFetch({ [LIST]: [] });
    renderWithProviders(<ConventionsView />);

    expect(await screen.findByRole("button", { name: "Run Scan" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Conventions in");
    expect(screen.queryByRole("button", { name: "ReScan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
  });

  it("Run Scan posts the extract, then shows the cards, the summary counters and ReScan", async () => {
    const fetchMock = mockFetch({ [LIST]: [], [EXTRACT]: SCAN });
    renderWithProviders(<ConventionsView />);

    fireEvent.click(await screen.findByRole("button", { name: "Run Scan" }));

    expect(await screen.findByText("Throw NotFoundError for a missing row")).toBeInTheDocument();
    expect(screen.getByText("Relative imports omit the file extension")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/conventions/extract") && i?.method === "POST")).toBe(true);

    // Scan summary: 5 proposed -> 3 grounded, 2 dropped, 1 merged/decided.
    expect(screen.getByText("5 proposed")).toBeInTheDocument();
    expect(screen.getByText("3 grounded in code")).toBeInTheDocument();
    expect(screen.getByText("2 dropped (evidence not found)")).toBeInTheDocument();
    expect(screen.getByText("1 merged or already decided")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
    expect(screen.getByText("0 of 2 accepted")).toBeInTheDocument();
  });

  it("a persisted board (reload) renders cards immediately with ReScan, no scan needed", async () => {
    mockFetch({ [LIST]: [A, B] });
    renderWithProviders(<ConventionsView />);

    expect(await screen.findByText("Throw NotFoundError for a missing row")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Reject" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(screen.getAllByTestId("confidence").map((n) => n.textContent)).toEqual(["90%", "70%"]);
  });

  it("Create skill appears only once at least one candidate is accepted", async () => {
    mockFetch({
      [LIST]: [A, B],
      "PATCH /conventions/a": { ...A, status: "accepted" },
    });
    renderWithProviders(<ConventionsView />);
    await screen.findByText("Throw NotFoundError for a missing row");
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]!);

    expect(await screen.findByRole("button", { name: "Create skill" })).toBeInTheDocument();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
  });

  it("Reject PATCHes status rejected and the card disappears", async () => {
    const fetchMock = mockFetch({
      [LIST]: [A, B],
      "PATCH /conventions/b": { ...B, status: "rejected" },
    });
    renderWithProviders(<ConventionsView />);
    await screen.findByText("Relative imports omit the file extension");

    const cardB = screen.getByRole("article", { name: "Relative imports omit the file extension" });
    fireEvent.click(within(cardB).getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(screen.queryByText("Relative imports omit the file extension")).not.toBeInTheDocument(),
    );
    expect(bodyOf(fetchMock, "PATCH", "/conventions/b")).toEqual({ status: "rejected" });
    expect(screen.getByText("Throw NotFoundError for a missing row")).toBeInTheDocument();
  });

  it("inline Edit PATCHes the new rule and the card shows it in place", async () => {
    const fetchMock = mockFetch({
      [LIST]: [A],
      "PATCH /conventions/a": { ...A, rule: "Throw NotFoundError, never null" },
    });
    renderWithProviders(<ConventionsView />);
    await screen.findByText("Throw NotFoundError for a missing row");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "Throw NotFoundError, never null" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Throw NotFoundError, never null")).toBeInTheDocument();
    expect(bodyOf(fetchMock, "PATCH", "/conventions/a")).toMatchObject({ rule: "Throw NotFoundError, never null" });
  });

  it("a failed scan surfaces the server message inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ error: { message: "Pick a model for Conventions in Settings → Feature Models" } }),
            { status: 422 },
          );
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    renderWithProviders(<ConventionsView />);

    fireEvent.click(await screen.findByRole("button", { name: "Run Scan" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The scan failed");
    expect(alert).toHaveTextContent("Pick a model for Conventions in Settings");
  });

  it("Create skill opens the modal; Create posts the edited draft and links to /skills", async () => {
    const fetchMock = mockFetch({
      [LIST]: [{ ...A, status: "accepted" }, B],
      [DRAFT]: {
        name: "repo-conventions",
        description: "1 house convention extracted from acme/api",
        type: "convention",
        body: "# repo-conventions\n\n## rule\nThrow NotFoundError",
        evidence_files: ["src/api/users.ts"],
        convention_ids: ["a"],
      },
      "GET /agents": [
        { id: "ag1", name: "General Reviewer", enabled: true },
        { id: "ag2", name: "Security", enabled: true },
      ],
      [SAVE]: {
        skill: {
          id: "s1",
          name: "repo-conventions",
          description: "d",
          type: "convention",
          source: "extracted",
          body: "x",
          enabled: true,
          version: 1,
          injection_detected: false,
          injection_matches: [],
        },
        created: true,
        agent_id: "ag1",
        linked: true,
      },
    });
    renderWithProviders(<ConventionsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Create skill" }));

    // The modal explains what is being created and preloads the editable body.
    expect(await screen.findByText(/Create a skill from 1 accepted convention/)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    const body = within(dialog).getByDisplayValue(/## rule/);
    fireEvent.change(body, { target: { value: "# repo-conventions\n\nMy edited body" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bodyOf(fetchMock, "POST", `/repos/${REPO_ID}/conventions/skill`)).toEqual({
      name: "repo-conventions",
      description: "1 house convention extracted from acme/api",
      type: "convention",
      body: "# repo-conventions\n\nMy edited body",
      agent_id: "ag1", // default: first enabled agent
    });
    expect(await screen.findByRole("link", { name: "View in Skills" })).toHaveAttribute("href", "/skills");
  });
});
