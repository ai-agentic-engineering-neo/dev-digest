import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocMarkdown } from "./DocMarkdown";

describe("DocMarkdown", () => {
  it("renders three visually distinct heading levels", () => {
    render(<DocMarkdown>{"# A\n\n## B\n\n### C"}</DocMarkdown>);
    const h1 = screen.getByRole("heading", { level: 1, name: "A" });
    const h2 = screen.getByRole("heading", { level: 2, name: "B" });
    const h3 = screen.getByRole("heading", { level: 3, name: "C" });
    const sizes = new Set([h1.style.fontSize, h2.style.fontSize, h3.style.fontSize]);
    expect(sizes.size).toBe(3);
  });

  it("renders bullet and numbered lists with visible markers", () => {
    render(<DocMarkdown>{"- x\n\nthen\n\n1. y"}</DocMarkdown>);
    const [ul, ol] = screen.getAllByRole("list");
    expect(ul!.tagName).toBe("UL");
    expect(ul!.style.listStyleType).toBe("disc");
    expect(ol!.tagName).toBe("OL");
    expect(ol!.style.listStyleType).toBe("decimal");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders inline code on the code background and fenced code as pre > code", () => {
    const { container } = render(<DocMarkdown>{"use `npm ci` here\n\n```ts\nconst a = 1;\n```"}</DocMarkdown>);
    const inline = screen.getByText("npm ci");
    expect(inline.tagName).toBe("CODE");
    expect(inline.style.backgroundColor).toBe("var(--code-bg)");
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.querySelector("code")?.textContent).toContain("const a = 1;");
  });

  it("renders links that open safely in a new tab", () => {
    render(<DocMarkdown>{"[l](https://e.x)"}</DocMarkdown>);
    const link = screen.getByRole("link", { name: "l" });
    expect(link).toHaveAttribute("href", "https://e.x");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows raw HTML as literal text and never creates its elements", () => {
    const { container } = render(<DocMarkdown>{"<b>x</b><script>alert(1)</script>"}</DocMarkdown>);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<b>x</b>");
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("renders nothing for empty input", () => {
    const { container } = render(<DocMarkdown>{""}</DocMarkdown>);
    expect(container.firstChild).toBeNull();
  });
});
