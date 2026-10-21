import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Onboarding, OnboardingRun, OnboardingView } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { OnboardingTourView } from "./OnboardingTourView";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb: { label: string }[] }) => (
    <div>
      <nav aria-label="crumb">{crumb.map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/components/mermaid-diagram", () => ({ MermaidDiagram: () => <div data-testid="diagram" /> }));

const repoCtx = {
  activeRepo: { id: "r1", full_name: "acme/payments-api", default_branch: "main", clone_path: "/tmp/x" } as Record<string, unknown> | null,
  notFound: false,
};
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: repoCtx.activeRepo }),
  useRepoNotFound: () => repoCtx.notFound,
}));
const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess }) }));

const RUN: OnboardingRun = {
  id: "run1",
  repo_id: "r1",
  status: "done",
  provider: "openrouter",
  model: "m",
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0.0021,
  files_indexed: 12450,
  error: null,
  started_at: "2026-10-21T10:00:00.000Z",
  finished_at: "2026-10-21T10:00:05.000Z",
};
const TOUR: Onboarding = {
  generated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 9200,
  tokens_out: 1100,
  cost_usd: 0.0021,
  files_indexed: 12450,
  limited: false,
  sections: [
    { kind: "architecture", title: "A", body: "Body text", diagram: null },
    { kind: "critical_paths", title: "C", items: [{ path: "src/server.ts", why: "bootstrap" }] },
    { kind: "run_locally", title: "R", items: [{ command: "pnpm dev", note: null }] },
    { kind: "reading_path", title: "G", items: [{ path: "src/server.ts", why: "entry" }] },
    { kind: "first_tasks", title: "F", items: [] },
  ],
};

let view: OnboardingView | Error;
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  view = { tour: TOUR, run: RUN, stale: false };
  repoCtx.activeRepo = { id: "r1", full_name: "acme/payments-api", default_branch: "main", clone_path: "/tmp/x" };
  repoCtx.notFound = false;
  replace.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith("/settings")) return json({ feature_models: {} });
    if (url.endsWith("/onboarding/generate") && init?.method === "POST") return json({ run: { ...RUN, status: "running" } }, 202);
    if (url.endsWith("/onboarding")) return view instanceof Error ? json({ error: { code: "x", message: "boom" } }, 500) : json(view);
    if (url.endsWith("/index-state")) return json({ updatedAt: "2026-10-21T10:00:00.000Z", status: "full" });
    if (url.endsWith("/resync")) return json({ status: "queued" }, 202);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("OnboardingTourView", () => {
  it("shows the header, subtitle with model and cost, the TOC and the cards; chevron and buttons are keyboard-reachable", async () => {
    const user = userEvent.setup();
    renderView();
    expect(await screen.findByRole("heading", { level: 1, name: /Onboarding for\s+acme\/payments-api/ })).toBeInTheDocument();
    expect(screen.getByText(/Generated from index of 12,450 files · last refreshed 2h ago/)).toBeInTheDocument();
    expect(screen.getByText(/deepseek\/deepseek-v4-flash · \$0\.0021/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Architecture overview" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "crumb" })).toHaveTextContent("acme/payments-api > Onboarding Tour");

    const chevron = screen.getAllByRole("button", { name: "Collapse section" })[0]!;
    chevron.focus();
    expect(chevron).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/stale|changed since/i)).not.toBeInTheDocument();
  });

  it("TOC click scrolls to the section and replaces the hash; an initial hash scrolls once rendered (AC-10, AC-11)", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.location.hash = "#run-locally";
    const user = userEvent.setup();
    renderView();
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: "How to run locally" })).toHaveAttribute("aria-current", "location");

    await user.click(screen.getByRole("link", { name: "Critical paths" }));
    expect(replace).toHaveBeenCalledWith("#critical-paths", { scroll: false });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    window.location.hash = "";
  });

  it("empty: generate button names the model and POSTs; the running run then shows the generating state", async () => {
    view = { tour: null, run: null, stale: false };
    const user = userEvent.setup();
    renderView();
    const btn = await screen.findByRole("button", { name: /Generate with openrouter\/deepseek\/deepseek-v4-flash/ });
    expect(screen.getByText(/five-section guided tour/)).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/onboarding/generate") && i?.method === "POST")).toBe(true),
    );
  });

  it("while running with a stored tour: Regenerate is disabled and the tour stays visible (AC-23)", async () => {
    view = { tour: TOUR, run: { ...RUN, status: "running", finished_at: null }, stale: false };
    renderView();
    const btn = await screen.findByRole("button", { name: /Regenerating/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });

  it("a failed run keeps the old tour and shows the error banner, Regenerate enabled (AC-34, EC-7)", async () => {
    view = { tour: TOUR, run: { ...RUN, status: "failed", error: "The model returned an invalid tour" }, stale: false };
    renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent("The model returned an invalid tour");
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
  });

  it("stale hint shows next to the subtitle (AC-39); limited banner rebuilds the index via resync (AC-37)", async () => {
    view = { tour: { ...TOUR, limited: true }, run: RUN, stale: true };
    const user = userEvent.setup();
    renderView();
    expect(await screen.findByText("Repository changed since this tour was generated")).toBeInTheDocument();
    expect(screen.getByText(/Generated from the file tree of 12,450 files/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rebuild index" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/resync"))).toBe(true));
  });

  it("Share link copies the page URL and toasts only when the write succeeded (AC-22)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    toastSuccess.mockReset();
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderView();
    await user.click(await screen.findByRole("button", { name: /Share link/ }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link copied"));
    expect(writeText).toHaveBeenCalledWith(window.location.href);

    // a rejected clipboard write must not claim success
    toastSuccess.mockReset();
    writeText.mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: /Share link/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("no clone and no tour: the not-cloned state has no generate button (AC-47)", async () => {
    repoCtx.activeRepo = { id: "r1", full_name: "acme/payments-api", default_branch: "main", clone_path: null };
    view = { tour: null, run: null, stale: false };
    renderView();
    expect(await screen.findByText("Repository not cloned yet", { selector: "div,h2,h3,p" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate|Regenerate/ })).not.toBeInTheDocument();
  });

  it("no clone but a stored tour: the tour shows with a note instead of Regenerate (D1)", async () => {
    repoCtx.activeRepo = { id: "r1", full_name: "acme/payments-api", default_branch: "main", clone_path: null };
    view = { tour: TOUR, run: RUN, stale: false };
    renderView();
    expect(await screen.findByText("Body text")).toBeInTheDocument();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
  });

  it("load error shows the error state with Retry; an unknown repo shows RepoNotFound", async () => {
    view = new Error("boom");
    const user = userEvent.setup();
    renderView();
    expect(await screen.findByText("Couldn’t load the onboarding tour")).toBeInTheDocument();
    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});
