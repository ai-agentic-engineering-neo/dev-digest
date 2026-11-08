import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ContextDocPreview } from "./ContextDocPreview";

afterEach(cleanup);

const DOC = { path: "docs/rate-limiting.md", source: "docs" as const, tokens: 820, attached_agents: 2 };
const LABELS = { source: "docs", tokens: "~820 tokens", attachedAgents: "2 agents", path: "Path" };

describe("ContextDocPreview (AC-2)", () => {
  it("renders the meta and the markdown body", () => {
    render(<ContextDocPreview doc={DOC} content={"# Rate limiting\n\nUse a **bucket**."} labels={LABELS} />);
    expect(screen.getByText("docs/rate-limiting.md")).toBeInTheDocument();
    expect(screen.getByText("~820 tokens")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rate limiting" })).toBeInTheDocument();
    expect(screen.getByText("bucket").tagName).toBe("STRONG");
  });

  it("does not render raw HTML from the doc — it is shown as text", () => {
    const { container } = render(
      <ContextDocPreview doc={DOC} content={'<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">'} labels={LABELS} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("shows the source badge in its source colour (SPEC-04 AC-1)", () => {
    render(<ContextDocPreview doc={DOC} content="x" labels={LABELS} />);
    expect(screen.getByText("docs")).toHaveStyle({ color: "var(--ok)" });
  });

  it("renders headings and lists with the shared doc typography (SPEC-04 AC-5)", () => {
    render(<ContextDocPreview doc={DOC} content={"# A\n## B\n- x"} labels={LABELS} />);
    expect(screen.getByRole("heading", { level: 1, name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("renders the optional action", () => {
    render(<ContextDocPreview doc={DOC} content="x" labels={LABELS} action={<button type="button">Attach</button>} />);
    expect(screen.getByRole("button", { name: "Attach" })).toBeInTheDocument();
  });
});
