import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate, ConventionList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionsView } from "./ConventionsView";

const REPO_ID = "11111111-1111-4111-8111-111111111111";

const PENDING: ConventionCandidate = {
  id: "c-pending",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  category: "async",
  evidence_start_line: 23,
  evidence_end_line: 31,
  accepted: false,
};

const ACCEPTED: ConventionCandidate = {
  ...PENDING,
  id: "c-accepted",
  rule: "All public route handlers return typed Result<T, ApiError>",
  evidence_path: "src/api/public/index.ts",
  evidence_start_line: 14,
  evidence_end_line: 20,
  evidence_snippet: "function handler(): Result<Item[], ApiError> {",
  confidence: 0.78,
  status: "accepted",
  accepted: true,
};

const REJECTED: ConventionCandidate = {
  ...PENDING,
  id: "c-rejected",
  rule: "Redis access goes through src/lib/redis.ts singleton",
  evidence_path: "src/lib/redis.ts",
  evidence_start_line: 1,
  evidence_end_line: 9,
  evidence_snippet: "export const redis = new Redis(config.redisUrl);",
  confidence: 0.85,
  status: "rejected",
  accepted: false,
};

let list: ConventionList = { items: [], extracted_at: null, sample_file_count: 0 };

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: REPO_ID }),
  usePathname: () => `/repos/${REPO_ID}/conventions`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: {
      id: REPO_ID,
      full_name: "acme/payments-api",
      provider: "github",
      default_branch: "main",
    },
    reposLoaded: true,
  }),
  useRepoNotFound: () => false,
}));

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function patchCalls(): Array<{ url: string; body: { status?: string; rule?: string } }> {
  return vi
    .mocked(fetch)
    .mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")
    .map((c) => ({
      url: String(c[0]),
      body: JSON.parse(String((c[1] as RequestInit).body)) as { status?: string; rule?: string },
    }));
}

beforeEach(() => {
  list = { items: [], extracted_at: null, sample_file_count: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/conventions")) {
        return { ok: true, status: 200, json: async () => list };
      }
      if (method === "GET" && url.includes("/agents")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body)) as { status?: string; rule?: string };
        const id = url.split("/").pop()!;
        list = {
          ...list,
          items: list.items.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(body.status ? { status: body.status as ConventionCandidate["status"], accepted: body.status === "accepted" } : {}),
                  ...(body.rule ? { rule: body.rule } : {}),
                }
              : c,
          ),
        };
        const item = list.items.find((c) => c.id === id);
        return { ok: true, status: 200, json: async () => item };
      }
      if (method === "POST" && url.endsWith("/extract")) {
        return { ok: true, status: 200, json: async () => list };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConventionsView", () => {
  it("shows Run Scan enabled and ReScan disabled when there are no items", async () => {
    renderView();
    expect(await screen.findByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Scan" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
  });

  it("renders cards, patches accept/reject/rule, and keeps selection client-only", async () => {
    list = {
      items: [PENDING, ACCEPTED, REJECTED],
      extracted_at: "2026-09-19T11:00:00Z",
      sample_file_count: 12,
    };
    renderView();

    expect(await screen.findByText(PENDING.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText(PENDING.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run Scan" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);

    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();

    const beforeDeselect = patchCalls().length;
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(patchCalls()).toHaveLength(beforeDeselect);
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();

    const pendingCard = screen.getByText(PENDING.rule).closest("article")!;
    fireEvent.click(within(pendingCard).getByRole("button", { name: "Accepted" }));
    await waitFor(() => expect(patchCalls().some((c) => c.body.status === "accepted")).toBe(true));

    fireEvent.click(within(screen.getByText(PENDING.rule).closest("article")!).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(patchCalls().some((c) => c.body.status === "rejected")).toBe(true));

    const before = patchCalls().length;
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(patchCalls()).toHaveLength(before);
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();

    const rejectedCard = screen.getByText(REJECTED.rule).closest("article")!;
    expect(rejectedCard).toBeInTheDocument();
    fireEvent.click(rejectedCard);
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByText(PENDING.rule).closest("article")!).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit rule"), {
      target: { value: "Prefer async/await over then-chains" },
    });
    fireEvent.blur(screen.getByLabelText("Edit rule"));
    await waitFor(() =>
      expect(patchCalls().some((c) => c.body.rule === "Prefer async/await over then-chains")).toBe(true),
    );
  });

  it("wires evidence hrefs to repoBlobUrl for GitHub line ranges", async () => {
    list = { items: [PENDING], extracted_at: "2026-09-19T11:00:00Z", sample_file_count: 1 };
    renderView();
    const link = await screen.findByRole("link", { name: "src/api/users.ts:23-31" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23-L31",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
  });

  it("opens Create skill from conventions from the toolbar", async () => {
    list = { items: [ACCEPTED], extracted_at: "2026-09-19T11:00:00Z", sample_file_count: 1 };
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Create skill" }));
    expect(await screen.findByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText(/Merged from 1 accepted conventions in payments-api/)).toBeInTheDocument();
  });
});
