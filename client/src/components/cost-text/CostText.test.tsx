import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CostText } from "./CostText";

afterEach(cleanup);

describe("CostText", () => {
  it("renders the formatted cost with the exact value as tooltip", () => {
    render(<CostText usd={0.001312} />);
    const el = screen.getByText("$0.0013");
    expect(el).toHaveAttribute("title", "$0.001312");
  });

  it("renders a muted dash without tooltip when the cost is unknown", () => {
    render(<CostText usd={null} />);
    const el = screen.getByText("—");
    expect(el).not.toHaveAttribute("title");
    expect(el.style.color).toBe("var(--text-muted)");
  });
});
