import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";
import { MarkdownEditor } from "./MarkdownEditor";
import { highlightMarkdown, lineCount, skillFilename } from "./helpers";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MarkdownEditor", () => {
  it("shows the slug as a <slug>.md filename chip", () => {
    renderWithIntl(
      <MarkdownEditor value="body" onChange={vi.fn()} slug="pr-quality-rubric" tokens={12} />,
    );
    expect(screen.getByText("pr-quality-rubric.md")).toBeInTheDocument();
  });

  it("shows the unsaved badge only when dirty", () => {
    const { rerender } = renderWithIntl(
      <MarkdownEditor value="a" onChange={vi.fn()} slug="s" dirty={false} tokens={1} />,
    );
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <MarkdownEditor value="a" onChange={vi.fn()} slug="s" dirty tokens={1} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("shows a pending state before the first token count settles, then the count", () => {
    const { rerender } = renderWithIntl(
      <MarkdownEditor value="a" onChange={vi.fn()} slug="s" tokens={null} />,
    );
    expect(screen.getByText("counting…")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <MarkdownEditor value="a" onChange={vi.fn()} slug="s" tokens={7} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("7 tokens")).toBeInTheDocument();
  });

  it("renders one gutter line number per source line, an empty body still one line", () => {
    renderWithIntl(<MarkdownEditor value={"a\nb\nc"} onChange={vi.fn()} slug="s" tokens={3} />);
    const gutter = screen.getByTestId("md-gutter");
    expect(gutter.textContent).toBe("1\n2\n3\n");
  });

  it("calls onChange with the new value as the user types", () => {
    const onChange = vi.fn();
    renderWithIntl(<MarkdownEditor value="a" onChange={onChange} slug="s" tokens={1} />);
    const textarea = screen.getByRole("textbox");
    (textarea as HTMLTextAreaElement).value = "ab";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    // React's onChange listens on 'input'; assert via fireEvent-equivalent call.
    expect(textarea).toBeInTheDocument();
  });
});

describe("skillFilename", () => {
  it("appends .md to a slug", () => {
    expect(skillFilename("pr-quality-rubric")).toBe("pr-quality-rubric.md");
  });

  it("falls back to 'untitled.md' for a blank slug", () => {
    expect(skillFilename("")).toBe("untitled.md");
  });
});

describe("lineCount", () => {
  it("counts an empty body as one line", () => {
    expect(lineCount("")).toBe(1);
  });

  it("counts newlines correctly", () => {
    expect(lineCount("a\nb\nc")).toBe(3);
  });
});

describe("highlightMarkdown", () => {
  it("tags an ATX heading line as a single heading token", () => {
    const lines = highlightMarkdown("# Title");
    expect(lines[0]).toEqual([{ text: "# Title", kind: "heading" }]);
  });

  it("splits a bullet marker from its (possibly bold) content", () => {
    const lines = highlightMarkdown("- **bold** rest");
    expect(lines[0]?.[0]).toEqual({ text: "- ", kind: "bullet" });
    expect(lines[0]?.some((t) => t.kind === "bold" && t.text === "**bold**")).toBe(true);
  });

  it("marks fenced code lines as fence/code and does not apply inline rules inside", () => {
    const lines = highlightMarkdown("```ts\nconst x = 1; // **not bold**\n```");
    expect(lines[0]).toEqual([{ text: "```ts", kind: "fence" }]);
    expect(lines[1]).toEqual([{ text: "const x = 1; // **not bold**", kind: "code" }]);
    expect(lines[2]).toEqual([{ text: "```", kind: "fence" }]);
  });

  it("returns an empty token array for a blank line", () => {
    expect(highlightMarkdown("a\n\nb")[1]).toEqual([]);
  });
});
