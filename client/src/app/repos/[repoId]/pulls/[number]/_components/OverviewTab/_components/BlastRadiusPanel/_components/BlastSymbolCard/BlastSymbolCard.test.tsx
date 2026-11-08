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

function renderCard(repoFullName: string | null, item: BlastDownstream = ITEM) {
  render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastSymbolCard item={item} repoFullName={repoFullName} linkSha="idx111" />
    </NextIntlClientProvider>,
  );
}

const expandButton = () => screen.getByRole("button", { name: "Expand getContext, 3 callers" });

afterEach(cleanup);

describe("BlastSymbolCard", () => {
  it("starts collapsed with the caller count in its accessible name, and expands/collapses on click", () => {
    renderCard("acme/app");
    expect(screen.getByText("3 callers")).toBeInTheDocument();
    expect(expandButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Endpoints affected" })).not.toBeInTheDocument();

    fireEvent.click(expandButton());
    const collapse = screen.getByRole("button", { name: "Collapse getContext, 3 callers" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    fireEvent.click(collapse);
    expect(expandButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("links callers to GitHub at linkSha, shows endpoint chips capped and no empty cron group", () => {
    renderCard("acme/app");
    fireEvent.click(expandButton());

    const link = screen.getByRole("link", { name: "…/src/a.ts:12" });
    expect(link.closest("[title]")).toHaveAttribute("title", "server/src/a.ts:12");
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/app", "idx111", "server/src/a.ts", 12));
    expect(link.getAttribute("href")).toContain("/blob/idx111/");
    expect(screen.getByText("agentsRoutes")).toBeInTheDocument();

    expect(screen.getByRole("group", { name: "Endpoints affected" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Crons affected" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/^GET \/route-/)).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getAllByText(/^GET \/route-/)).toHaveLength(10);
  });

  it("shortens a long caller path, keeps the full path in the tooltip and the caller name whole", () => {
    const name = "handleVeryLongCallerFunctionNameThatMustNotBeCut";
    renderCard("acme/app", {
      ...ITEM,
      callers: [{ name, file: "client/src/app/repos/_components/FileCard/FileCard.tsx", line: 58 }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand getContext, 1 caller" }));
    const link = screen.getByRole("link", { name: "…/FileCard/FileCard.tsx:58" });
    expect(link.closest("[title]")).toHaveAttribute("title", "client/src/app/repos/_components/FileCard/FileCard.tsx:58");
    // The name is rendered in full AND not clipped by CSS (no ellipsis / nowrap+hidden), so nothing hides its tail.
    const caller = screen.getByText(name);
    expect(caller.textContent).toBe(name);
    expect(caller).not.toHaveStyle({ textOverflow: "ellipsis" });
    expect(caller).not.toHaveStyle({ overflow: "hidden" });
  });

  it("does not take focus on a mouse press, so the focus ring is keyboard-only", () => {
    renderCard("acme/app");
    const header = expandButton();
    expect(fireEvent.mouseDown(header)).toBe(false); // default (focus) prevented
    header.focus(); // keyboard / programmatic focus still works
    expect(header).toHaveFocus();
  });

  it("renders plain text locations without a repo, and cron chips when present", () => {
    renderCard(null, { ...ITEM, crons_affected: ["reset-buckets (hourly)"] });
    fireEvent.click(expandButton());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("…/src/a.ts:12")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Crons affected" })).toHaveTextContent("reset-buckets (hourly)");
  });
});
