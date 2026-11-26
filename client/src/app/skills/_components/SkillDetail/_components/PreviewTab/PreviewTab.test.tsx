import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { makeSkill } from "@/app/skills/_components/fixtures";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

function renderPreview(skill: Skill) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <PreviewTab skill={skill} />
    </NextIntlClientProvider>,
  );
}

describe("PreviewTab", () => {
  it("renders the saved body as Markdown", () => {
    renderPreview(makeSkill({ body: "# PR quality rubric\n\n- **Scope**: one concern per PR" }));
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText("Rendered as the reviewing agent receives it")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PR quality rubric" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Scope: one concern per PR");
    expect(screen.getByText("Scope").tagName).toBe("STRONG");
  });

  it("never turns raw HTML in the body into elements", () => {
    renderPreview(
      makeSkill({ body: 'Intro\n\n<script>window.__pwned = true</script>\n\n<img src=x onerror="alert(1)"> <b>bold</b>' }),
    );
    const card = screen.getByRole("article");
    expect(card.querySelector("script, img, b")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(screen.getByText("Intro")).toBeInTheDocument();
  });
});
