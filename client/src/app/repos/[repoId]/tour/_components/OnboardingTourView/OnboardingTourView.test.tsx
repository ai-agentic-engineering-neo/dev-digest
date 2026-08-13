import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingFacts, OnboardingPage, OnboardingProvenance } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import * as toastLib from "@/lib/toast";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo-1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

// AppShell pulls in the sidebar/command-palette/shell-context machinery, none
// of which this view's own behaviour depends on — replaced with a passthrough
// so the test exercises OnboardingTourView itself, not AppShell's internals.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const PROVENANCE: OnboardingProvenance = {
  files_indexed: 120,
  files_excluded: 5,
  index_status: "full",
  index_reason: null,
  index_sha: "abc123sha",
  index_updated_at: "2026-08-10T00:00:00Z",
  prs_weighted: 42,
  hotness_window_days: 180,
  generated_at: "2026-08-12T00:00:00Z",
  model: "deepseek/deepseek-v4-flash",
  provider: "openrouter",
  attempts: 1,
  tokens_in: 1000,
  tokens_out: 500,
  cost_usd: 0.002,
};

const FACTS: OnboardingFacts = {
  stack: {
    language: { value: "TypeScript", evidence_file: "package.json" },
    runtime: { value: "Node 22", evidence_file: "package.json" },
    package_manager: { value: "pnpm", evidence_file: "pnpm-lock.yaml" },
    frameworks: [{ value: "Next.js", evidence_file: "package.json" }],
  },
  ranked_files: [{ path: "src/index.ts", pagerank: 0.9, hotness: 0.5, weighted: 1.35 }],
  setup_steps: [{ command: "pnpm install", kind: "install", evidence_file: "package.json" }],
  routes: [{ file: "src/routes/repos.ts", endpoints: ["GET /repos"], crons: [] }],
};

const SKELETON_PAGE: OnboardingPage = {
  status: "skeleton",
  reason: "No tour has been generated yet.",
  stale: false,
  provenance: { ...PROVENANCE, generated_at: null, model: null },
  facts: FACTS,
  tour: null,
};

const GENERATED_PAGE: OnboardingPage = {
  status: "generated",
  reason: null,
  stale: false,
  provenance: PROVENANCE,
  facts: FACTS,
  tour: {
    sections: [
      {
        kind: "architecture",
        title: "Architecture Overview",
        body: "This service exposes a REST API.\n\n<script>alert(1)</script>",
        diagram: null,
        links: [],
      },
      {
        kind: "critical_paths",
        title: "Critical Paths",
        body: "",
        links: [],
        entries: [{ path: "src/a.ts", chain: ["src/b.ts"], reason: "Core entry point." }],
      },
      {
        kind: "run_locally",
        title: "How to Run Locally",
        body: "- `pnpm install`\n- `pnpm dev`",
        links: [],
      },
      {
        kind: "reading_path",
        title: "Guided Reading Path",
        body: "",
        links: [],
        entries: [{ path: "src/index.ts", reason: "Start here." }],
      },
      {
        kind: "first_tasks",
        title: "First Tasks",
        body: "_Model-suggested_\n\n### Fix the bug\n\nDo X.\n\nFiles: `src/a.ts`",
        links: [],
      },
    ],
  },
};

const EMPTY_PAGE: OnboardingPage = {
  status: "empty",
  reason: "This repository has never been cloned or indexed.",
  stale: false,
  provenance: { ...PROVENANCE, files_indexed: 0, files_excluded: 0, prs_weighted: 0, generated_at: null, model: null },
  facts: { stack: { language: null, runtime: null, package_manager: null, frameworks: [] }, ranked_files: [], setup_steps: [], routes: [] },
  tour: null,
};

const refetch = vi.fn();
const mutate = vi.fn();
let pageData: OnboardingPage = SKELETON_PAGE;
let mutationPending = false;

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboardingTour: () => ({
    data: pageData,
    isLoading: false,
    isError: false,
    error: null,
    refetch,
  }),
  useGenerateOnboardingTour: () => ({ mutate, isPending: mutationPending }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pageData = SKELETON_PAGE;
  mutationPending = false;
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnboardingTourView />
    </NextIntlClientProvider>,
  );
}

vi.spyOn(toastLib, "useToast").mockReturnValue({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
});

import { OnboardingTourView } from "./OnboardingTourView";

describe("OnboardingTourView", () => {
  it("no stored tour → announces the skeleton status and renders the deterministic facts, not a table of contents (AC-33, AC-35, AC-45)", () => {
    renderView();
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("No tour has been generated yet.");
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    expect(screen.getByText("src/routes/repos.ts")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("AC-43 — setup steps are copyable text only, no control that executes a command", () => {
    renderView();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("a generated tour renders a ToC of exactly the five sections, each linking to its section (AC-40)", () => {
    pageData = GENERATED_PAGE;
    renderView();
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const links = within(toc).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "#tour-section-architecture",
      "#tour-section-critical_paths",
      "#tour-section-run_locally",
      "#tour-section-reading_path",
      "#tour-section-first_tasks",
    ]);
  });

  it("AC-41 — a section body containing a script tag never renders as a live <script> element", () => {
    pageData = GENERATED_PAGE;
    const { container } = renderView();
    expect(container.querySelector("script")).toBeNull();
  });

  it("AC-42 — an invalid diagram renders the section with no diagram and no error state", () => {
    pageData = {
      ...GENERATED_PAGE,
      tour: {
        sections: GENERATED_PAGE.tour!.sections.map((section) =>
          section.kind === "architecture" ? { ...section, diagram: "not a real diagram, just prose" } : section,
        ),
      },
    };
    const { container } = renderView();
    expect(screen.getByRole("heading", { name: "Architecture Overview" })).toBeInTheDocument();
    expect(screen.getByText("This service exposes a REST API.")).toBeInTheDocument();
    // Only the fixed section icon should render — no diagram markup added on top of it.
    const architectureSection = container.querySelector("#tour-section-architecture");
    expect(architectureSection).not.toBeNull();
    expect(architectureSection!.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("AC-44 — opening a critical-path entry links to the repository host at the tour's indexed revision", () => {
    pageData = GENERATED_PAGE;
    renderView();
    const link = screen.getAllByRole("link", { name: /open on github/i })[0]!;
    expect(link.getAttribute("href")).toBe("https://github.com/acme/widgets/blob/abc123sha/src/a.ts");
    // The remaining chain hop renders as inert breadcrumb text, not a link.
    expect(screen.getByText("src/a.ts → src/b.ts")).toBeInTheDocument();
  });

  it("empty status renders an explanatory empty state and no generate control (AC-37)", () => {
    pageData = EMPTY_PAGE;
    renderView();
    expect(screen.getByText("This repository has never been cloned or indexed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });

  it("clicking Generate triggers the mutation", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /generate onboarding tour/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("while a generation is in flight, the action is disabled and announced (AC-20, AC-45)", () => {
    pageData = { ...SKELETON_PAGE, status: "generating" };
    renderView();
    expect(screen.getByRole("status").textContent).toContain("Generating your tour…");
    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled();
  });
});
