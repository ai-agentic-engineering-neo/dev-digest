import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Skill, SkillImportPreview, SkillStatsSummary } from "@devdigest/shared";
import { mockFetch, renderWithProviders, userEvent } from "@/test/render";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
// The Stats tab is owned elsewhere; it is not under test here.
vi.mock("../SkillDetail/_components/SkillStatsTab", () => ({ SkillStatsTab: () => <div data-testid="stats-tab" /> }));

const nav = vi.hoisted(() => {
  let params = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    set(qs: string) {
      params = new URLSearchParams(qs);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    replace: undefined as unknown as ReturnType<typeof vi.fn>,
  };
});
nav.replace = vi.fn((href: string) => nav.set(href.split("?")[1] ?? ""));

vi.mock("next/navigation", async () => {
  const react = await import("react");
  return {
    useRouter: () => ({ replace: nav.replace, push: nav.replace }),
    useSearchParams: () => react.useSyncExternalStore(nav.subscribe, nav.get, nav.get),
  };
});

import { SkillsView } from "./SkillsView";

beforeEach(() => {
  nav.replace.mockClear();
  nav.set("");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SKILL: Skill = {
  id: "s1",
  name: "test-quality",
  description: "Check that new branches have tests",
  type: "rubric",
  source: "manual",
  body: "# Rule\n\nAssert behaviour.",
  enabled: true,
  version: 5,
};
const OTHER: Skill = { ...SKILL, id: "s2", name: "api-contract", description: "Use when routes change", type: "security", source: "community", version: 2 };
const STATS: SkillStatsSummary[] = [
  { skill_id: "s1", agents_count: 3, pull_rate: 0.71, accept_rate: 0.74 },
  { skill_id: "s2", agents_count: 1, pull_rate: null, accept_rate: null },
];
const ROUTES = { "GET /skills": [SKILL, OTHER], "GET /skills/stats": STATS };

describe("SkillsView list", () => {
  it("renders cards with stats footers (dash for nulls, singular/plural)", async () => {
    mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    const first = (await screen.findByRole("button", { name: /test-quality/ })) as HTMLElement;
    expect(await within(first).findByText("3 agents")).toBeInTheDocument();
    expect(within(first).getByText("71% pull")).toBeInTheDocument();
    expect(within(first).getByText("74% accept")).toBeInTheDocument();
    expect(within(first).getByText("Manual")).toBeInTheDocument();
    const second = screen.getByRole("button", { name: /api-contract/ });
    expect(within(second).getByText("1 agent")).toBeInTheDocument();
    expect(within(second).getByText("— pull")).toBeInTheDocument();
    expect(within(second).getByText("— accept")).toBeInTheDocument();
    expect(within(second).getByText("Community")).toBeInTheDocument();
  });

  it("selects the first skill and the Config tab by default; stale id and bad tab fall back", async () => {
    nav.set("id=gone&tab=evals");
    mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    const detail = await screen.findByRole("region", { name: "test-quality" });
    expect(within(detail).getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /test-quality/ })).toHaveAttribute("aria-current", "true");
  });

  it("clicking a card updates the URL and shows that skill's detail", async () => {
    mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    await userEvent.click(await screen.findByRole("button", { name: /api-contract/ }));
    expect(nav.replace).toHaveBeenCalledWith("/skills?id=s2&tab=config");
    const detail = await screen.findByRole("region", { name: "api-contract" });
    expect(within(detail).getAllByText("v2").length).toBeGreaterThan(0);
    expect(within(detail).queryByText("v5")).not.toBeInTheDocument();
  });

  it("switching tabs writes the tab to the URL", async () => {
    nav.set("id=s1&tab=config");
    mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    await userEvent.click(await screen.findByText("Preview"));
    expect(nav.replace).toHaveBeenCalledWith("/skills?id=s1&tab=preview");
    expect(await screen.findByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
  });

  it("the enabled switch on a card PUTs { enabled }", async () => {
    const calls = mockFetch({ ...ROUTES, "PUT /skills/s1": { ...SKILL, enabled: false } });
    renderWithProviders(<SkillsView />);
    await screen.findByRole("button", { name: /test-quality/ });
    const group = screen.getAllByRole("group", { name: "Enable skill test-quality" })[0]!;
    fireEvent.click(within(group).getByRole("switch"));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeDefined());
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: "/skills/s1", body: { enabled: false } });
  });

  it("filters by search", async () => {
    mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    await screen.findByRole("button", { name: /test-quality/ });
    await userEvent.type(screen.getByPlaceholderText("Search skills…"), "routes");
    expect(screen.queryByRole("button", { name: /test-quality/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /api-contract/ })).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    mockFetch({ "GET /skills": [], "GET /skills/stats": [] });
    renderWithProviders(<SkillsView />);
    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
  });

  it("shows an error state when the list fails to load", async () => {
    mockFetch({});
    renderWithProviders(<SkillsView />);
    expect(await screen.findByText("Could not load skills.")).toBeInTheDocument();
  });

  it("deleting the selected skill selects another one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    nav.set("id=s1&tab=config");
    mockFetch({ ...ROUTES, "DELETE /skills/s1": {} });
    renderWithProviders(<SkillsView />);
    await screen.findByRole("region", { name: "test-quality" });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/skills?id=s2&tab=config"));
  });
});

describe("Add Skill menu and drawer", () => {
  it("offers Create and Import from file", async () => {
    mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    await screen.findByRole("button", { name: /test-quality/ });
    await userEvent.click(screen.getByText("Add Skill"));
    expect(screen.getByText("Create skill")).toBeInTheDocument();
    expect(screen.getByText("Import from file")).toBeInTheDocument();
    expect(screen.queryByText("Import from URL")).not.toBeInTheDocument();
  });

  it("create form validates and explains the description as a directive", async () => {
    const calls = mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    await screen.findByRole("button", { name: /test-quality/ });
    await userEvent.click(screen.getByText("Add Skill"));
    await userEvent.click(screen.getByText("Create skill"));
    expect(within(screen.getByRole("dialog")).getByText(/skill’s interface/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Save skill"));
    expect(screen.getAllByText("This field is required.").length).toBeGreaterThan(0);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("import shows the preview and stores nothing until confirmed", async () => {
    const preview: SkillImportPreview = {
      name: "imported-rubric",
      description: "Use when reviewing tests",
      type: "rubric",
      body: "# Imported body",
      source_file: "SKILL.md",
      ignored_entries: ["scripts/run.sh"],
      warnings: ["Contains instruction-override phrasing"],
      truncated: true,
    };
    const calls = mockFetch({
      ...ROUTES,
      "POST /skills/import/preview": preview,
      "POST /skills": { ...SKILL, id: "s9", name: "imported-rubric" },
    });
    renderWithProviders(<SkillsView />);
    await screen.findByRole("button", { name: /test-quality/ });
    await userEvent.click(screen.getByText("Add Skill"));
    await userEvent.click(screen.getByText("Import from file"));

    const input = screen.getByLabelText("Skill file") as HTMLInputElement;
    await userEvent.upload(input, new File(["# hi"], "SKILL.md", { type: "text/markdown" }));

    expect(await screen.findByText(/someone else’s instructions/)).toBeInTheDocument();
    expect(screen.getByText("Contains instruction-override phrasing")).toBeInTheDocument();
    expect(screen.getByText("scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText(/Not read, not executed/)).toBeInTheDocument();
    expect(screen.getByText(/truncated/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/skills/import/preview"]);
    expect(calls[calls.findIndex((c) => c.path === "/skills/import/preview")]!.body).toMatchObject({
      filename: "SKILL.md",
      content_base64: expect.any(String),
    });

    await userEvent.click(screen.getByText("Save skill"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/skills")).toBe(true));
    const created = calls.find((c) => c.method === "POST" && c.path === "/skills")!;
    expect(created.body).toMatchObject({ name: "imported-rubric", body: "# Imported body", source: "imported_file" });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/skills?id=s9&tab=config"));
  });

  it("rejects an oversize or wrong-type upload client-side", async () => {
    const calls = mockFetch(ROUTES);
    renderWithProviders(<SkillsView />);
    await screen.findByRole("button", { name: /test-quality/ });
    await userEvent.click(screen.getByText("Add Skill"));
    await userEvent.click(screen.getByText("Import from file"));
    const input = screen.getByLabelText("Skill file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "run.sh")] } });
    expect(await screen.findByText("Only .md and .zip files are supported.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});
