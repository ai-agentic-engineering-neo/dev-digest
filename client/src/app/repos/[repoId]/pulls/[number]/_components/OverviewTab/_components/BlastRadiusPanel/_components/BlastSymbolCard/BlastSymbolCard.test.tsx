import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastDownstream } from "@/lib/types";
import { BlastSymbolCard } from "./BlastSymbolCard";

const ENDPOINTS = Array.from({ length: 10 }, (_, i) => `GET /route-${i}`);

const ITEM: BlastDownstream = {
  symbol: "getContext",
  file: "server/src/ctx.ts",
  kind: "function",
  callers: [
    { name: "agentsRoutes", file: "server/src/a.ts", line: 12 },
    { name: "reposRoutes", file: "server/src/b.ts", line: 7 },
    { name: "pullsRoutes", file: "server/src/c.ts", line: 30 },
  ],
  endpoints_affected: ENDPOINTS,
  crons_affected: [],
};

function renderCard(repoFullName: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastSymbolCard item={ITEM} repoFullName={repoFullName} linkSha="idx111" />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("BlastSymbolCard", () => {
  it("links callers to GitHub at linkSha and caps endpoint chips", () => {
    renderCard("acme/app");

    expect(screen.getByText("3 callers")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "server/src/a.ts:12" });
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/app", "idx111", "server/src/a.ts", 12));
    expect(link.getAttribute("href")).toContain("/blob/idx111/");
    expect(screen.getByText("agentsRoutes")).toBeInTheDocument();

    expect(screen.getAllByText(/^GET \/route-/)).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getAllByText(/^GET \/route-/)).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("renders plain text locations without a repo", () => {
    renderCard(null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("server/src/a.ts:12")).toBeInTheDocument();
  });

  it("omits the crons group when there are none", () => {
    renderCard("acme/app");
    expect(screen.getByRole("group", { name: "Endpoints affected" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Crons affected" })).not.toBeInTheDocument();
  });
});
