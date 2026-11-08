import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import type { BlastDownstream } from "@/lib/types";
import { BlastGraph } from "./BlastGraph";

const ITEM: BlastDownstream = {
  symbol: "rateLimit",
  file: "src/mw/ratelimit.ts",
  kind: "function",
  callers: [{ name: "publicRouter", file: "src/api/index.ts", line: 23 }],
  endpoints_affected: ["GET /items"],
  crons_affected: [],
};

function renderGraph(downstream: BlastDownstream[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastGraph downstream={downstream} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("BlastGraph", () => {
  it("renders a labelled image with symbol, caller and endpoint nodes plus a legend", () => {
    renderGraph([ITEM]);
    const img = screen.getByRole("img", { name: messages.graph.ariaLabel });
    expect(img).toHaveTextContent("rateLimit()");
    expect(img).toHaveTextContent("publicRouter");
    expect(img).toHaveTextContent("GET /items");
    expect(screen.getByText(messages.graph.legend.symbol)).toBeInTheDocument();
    expect(screen.getByText(messages.graph.legend.endpoints)).toBeInTheDocument();
    expect(screen.queryByText(messages.graph.cronsHint)).not.toBeInTheDocument();
  });

  it("points to the Tree view for crons", () => {
    renderGraph([{ ...ITEM, crons_affected: ["nightly"] }]);
    expect(screen.getByText(messages.graph.cronsHint)).toBeInTheDocument();
  });

  it("shows the empty message instead of an empty drawing", () => {
    renderGraph([]);
    expect(screen.getByText(messages.graph.empty)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
