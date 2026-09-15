import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge", () => {
  it("compact: cost only", () => {
    renderBadge(<RunCostBadge usd={0.012} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.queryByText(/8\.2K/)).not.toBeInTheDocument();
  });

  it("detailed: cost · tokens in→out", () => {
    const { container } = renderBadge(
      <RunCostBadge variant="detailed" usd={0.014} tokensIn={8200} tokensOut={1300} />,
    );
    expect(container.textContent).toBe("$0.014· 8.2K→1.3K");
    expect(screen.getByTitle("Cost of this review")).toBeInTheDocument();
  });

  it("no data: em-dash, never $0.00", () => {
    const { container } = renderBadge(<RunCostBadge usd={null} />);
    expect(container.textContent).toBe("—");
    expect(container.textContent).not.toContain("$0");
  });

  it("detailed with unknown cost still shows known tokens", () => {
    const { container } = renderBadge(
      <RunCostBadge variant="detailed" usd={null} tokensIn={9119} tokensOut={1240} />,
    );
    expect(container.textContent).toBe("—· 9.1K→1.2K");
  });
});
