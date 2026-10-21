import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Markdown } from "@devdigest/ui";

afterEach(cleanup);

describe("Markdown primitive code rendering", () => {
  it("renders a fenced block as <pre><code> without the inline chip style (regression: fenced code rendered as an inline chip)", () => {
    const { container } = render(<Markdown>{"```\npnpm dev\npnpm test\n```"}</Markdown>);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    const code = pre!.querySelector("code")!;
    expect(code.textContent).toContain("pnpm dev\npnpm test");
    expect(code.style.padding).toBe("");
    expect(code.style.background).toBe("");
  });

  it("keeps inline code as a styled chip outside any <pre>", () => {
    const { container } = render(<Markdown>{"Run `pnpm dev` now"}</Markdown>);
    expect(container.querySelector("pre")).toBeNull();
    const code = container.querySelector("code")!;
    expect(code.textContent).toBe("pnpm dev");
    expect(code.style.padding).not.toBe("");
  });

  it("does not render raw HTML from the text (AC-50)", () => {
    const { container } = render(<Markdown>{"hi <script>alert(1)</script><b>x</b>"}</Markdown>);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
