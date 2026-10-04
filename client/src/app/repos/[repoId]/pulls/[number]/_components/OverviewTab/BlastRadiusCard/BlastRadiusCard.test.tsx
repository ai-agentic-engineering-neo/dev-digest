import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { mockFetch, renderWithProviders, userEvent } from "@/test/render";
import { githubBlobUrl } from "@/lib/github-urls";
import { BlastRadiusCard } from "./BlastRadiusCard";

const base = {
  changed_symbols: [{ name: "chargeCard", file: "src/pay.ts", kind: "function" }],
  downstream: [] as unknown[],
  summary: "",
  degraded: false,
  reason: null as string | null,
  impacted_endpoints: [] as string[],
};

const props = { prId: "pr1", repoId: "r1", repoFullName: "acme/api", headSha: "abc123" };

afterEach(() => vi.unstubAllGlobals());

describe("BlastRadiusCard", () => {
  it("renders summary, symbol, caller link and chips", async () => {
    mockFetch({
      "GET /pulls/pr1/blast": {
        ...base,
        downstream: [
          {
            symbol: "chargeCard",
            callers: [{ name: "checkout", file: "src/checkout.ts", line: 42 }],
            endpoints_affected: ["POST /orders"],
            crons_affected: ["nightly-billing"],
          },
        ],
        impacted_endpoints: ["POST /orders"],
      },
    });
    renderWithProviders(<BlastRadiusCard {...props} />);

    expect(await screen.findByText("chargeCard")).toBeInTheDocument();
    expect(screen.getByText("1 caller")).toBeInTheDocument();
    expect(screen.getByText("symbol")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /src\/checkout\.ts line 42/ });
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/api", "abc123", "src/checkout.ts", 42));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("POST /orders")).toBeInTheDocument();
    expect(screen.getByText("nightly-billing")).toBeInTheDocument();
  });

  it("collapses symbols past the cap behind a show-more button", async () => {
    const names = Array.from({ length: 14 }, (_, i) => `sym${String(i).padStart(2, "0")}`);
    mockFetch({
      "GET /pulls/pr1/blast": {
        ...base,
        changed_symbols: names.map((name) => ({ name, file: "src/a.ts", kind: "function" })),
        downstream: names.map((symbol) => ({
          symbol,
          callers: [{ name: "caller", file: "src/c.ts", line: 1 }],
          endpoints_affected: [],
          crons_affected: [],
        })),
        impacted_endpoints: [],
      },
    });
    renderWithProviders(<BlastRadiusCard {...props} />);

    expect(await screen.findByText("sym11")).toBeInTheDocument();
    expect(screen.queryByText("sym12")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show 2 more symbols" }));
    expect(screen.getByText("sym13")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer symbols" })).toBeInTheDocument();
  });

  it("lists endpoints that no symbol card claims, so the stat matches the page", async () => {
    mockFetch({
      "GET /pulls/pr1/blast": {
        ...base,
        downstream: [
          {
            symbol: "chargeCard",
            callers: [{ name: "checkout", file: "src/checkout.ts", line: 42 }],
            endpoints_affected: ["POST /orders"],
            crons_affected: [],
          },
        ],
        impacted_endpoints: ["POST /orders", "GET /health"],
      },
    });
    renderWithProviders(<BlastRadiusCard {...props} />);

    expect(await screen.findByText(/1 more endpoint reached through callers/)).toBeInTheDocument();
    expect(screen.getByText("GET /health")).toBeInTheDocument();
  });

  it("collapses a long list of unattributed endpoints", async () => {
    const eps = Array.from({ length: 9 }, (_, i) => `GET /e${i}`);
    mockFetch({ "GET /pulls/pr1/blast": { ...base, impacted_endpoints: eps } });
    renderWithProviders(<BlastRadiusCard {...props} />);

    expect(await screen.findByText("GET /e5")).toBeInTheDocument();
    expect(screen.queryByText("GET /e6")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show 3 more endpoints" }));
    expect(screen.getByText("GET /e8")).toBeInTheDocument();
  });

  it("shows the empty message when not degraded and no callers", async () => {
    mockFetch({ "GET /pulls/pr1/blast": base });
    renderWithProviders(<BlastRadiusCard {...props} />);
    expect(await screen.findByText(/no downstream callers found/)).toBeInTheDocument();
    // A symbol with no downstream impact gets no card; the empty message stands in.
    expect(screen.queryByText("chargeCard")).not.toBeInTheDocument();
  });

  it("shows the degraded banner (not the empty claim) and resyncs", async () => {
    const calls = mockFetch({
      "GET /pulls/pr1/blast": { ...base, degraded: true, reason: "index_failed" },
      "POST /repos/r1/resync": { status: "started" },
    });
    renderWithProviders(<BlastRadiusCard {...props} />);

    expect(await screen.findByText("Blast radius is incomplete")).toBeInTheDocument();
    expect(screen.getByText("Indexing this repository failed.")).toBeInTheDocument();
    expect(screen.queryByText(/no downstream callers found/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /resync/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/repos/r1/resync")).toBe(true));
    expect(await screen.findByText(/Resync started/)).toBeInTheDocument();
  });
});
