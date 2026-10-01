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

  it("shows the empty message when not degraded and no callers", async () => {
    mockFetch({ "GET /pulls/pr1/blast": base });
    renderWithProviders(<BlastRadiusCard {...props} />);
    expect(await screen.findByText(/no downstream callers found/)).toBeInTheDocument();
    expect(screen.getByText("chargeCard")).toBeInTheDocument();
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
