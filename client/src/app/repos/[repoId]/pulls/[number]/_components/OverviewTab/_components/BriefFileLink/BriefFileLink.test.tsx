import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { githubBlobUrl } from "@/lib/github-urls";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { BriefFileLink } from "./BriefFileLink";

type Props = Parameters<typeof BriefFileLink>[0];

function renderLink(props: Partial<Props>) {
  const onOpenFile = vi.fn();
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ brief: messages }}>
      <BriefFileLink
        path="src/a.ts"
        line={null}
        inDiff
        repoFullName={null}
        linkSha={null}
        onOpenFile={onOpenFile}
        label="src/a.ts"
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("BriefFileLink", () => {
  it("opens an in-diff ref at its line or range, accent-styled with hover", () => {
    const onOpenFile = renderLink({ line: 38, endLine: 50 });
    const button = screen.getByRole("button", { name: /src\/a\.ts:38/ });
    expect(button).toHaveClass("mono");
    expect(button.style.color).toBe("var(--accent-text)");
    expect(button.style.outline).toBe("");
    fireEvent.mouseEnter(button);
    expect(button.style.color).toBe("var(--accent-hover)");
    fireEvent.click(button);
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts", { start: 38, end: 50 });
  });

  it("uses a single-line range without endLine and null without a line", () => {
    const one = renderLink({ line: 40 });
    fireEvent.click(screen.getByRole("button"));
    expect(one).toHaveBeenCalledWith("src/a.ts", { start: 40, end: 40 });
  });

  it("passes null lines for a file-level ref", () => {
    const onOpenFile = renderLink({});
    fireEvent.click(screen.getByRole("button"));
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts", null);
  });

  it("links blast-only refs to GitHub and mutes non-openable ones", () => {
    renderLink({ path: "lib/b.ts", label: "lib/b.ts", line: 12, inDiff: false, repoFullName: "acme/app", linkSha: "idx1" });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/app", "idx1", "lib/b.ts", 12));
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.style.color).toBe("var(--accent-text)");
  });

  it("renders a plain muted span without repo or sha", () => {
    renderLink({ inDiff: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/a.ts").style.color).toBe("var(--text-muted)");
  });

  it("keeps the reason inside the same button as literal text", () => {
    const onOpenFile = renderLink({ reason: "<img src=x>" });
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("src/a.ts — <img src=x>");
    expect(button.querySelector("img")).toBeNull();
    fireEvent.click(button);
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("renders the reason in secondary colour inside the accent button", () => {
    renderLink({ reason: "Largest change" });
    const button = screen.getByRole("button");
    const reason = screen.getByText("Largest change");
    expect(button).toContainElement(reason);
    expect(reason.style.color).toBe("var(--text-secondary)");
    expect(screen.getByText("src/a.ts").style.color).toBe("");
    expect(button.style.color).toBe("var(--accent-text)");
  });
});
