import { describe, it, expect } from "vitest";
import { formFromMarkdown, normalizeImportedBody, readSkillFile, toSkillSlug } from "./helpers";

const file = (name: string, text: string) => new File([text], name, { type: "text/markdown" });

describe("skill file import helpers", () => {
  it("toSkillSlug", () => {
    expect(toSkillSlug("  API Breaking-Change Rules! ")).toBe("api-breaking-change-rules");
    expect(toSkillSlug("Café — déjà vu")).toBe("cafe-deja-vu");
    expect(toSkillSlug("x".repeat(80))).toHaveLength(64);
  });

  it("normalizeImportedBody drops the BOM, CRLF and trailing space", () => {
    expect(normalizeImportedBody("﻿# A\r\nb\r\n\n  ")).toBe("# A\nb");
  });

  it("formFromMarkdown: name from the first heading, else the file name; first paragraph as description", () => {
    expect(formFromMarkdown("# Breaking change\n\n- list\nFlag removed routes.", "file")).toEqual({
      name: "breaking-change",
      description: "Flag removed routes.",
      type: "custom",
      body: "# Breaking change\n\n- list\nFlag removed routes.",
    });
    expect(formFromMarkdown("plain text", "My Rules").name).toBe("my-rules");
  });

  it("readSkillFile reads a Markdown file into form values", async () => {
    const res = await readSkillFile(file("deprecation.md", "# Deprecation policy\r\nRemove after a deprecation.\r\n"));
    expect(res).toEqual({
      ok: true,
      form: {
        name: "deprecation-policy",
        description: "Remove after a deprecation.",
        type: "custom",
        body: "# Deprecation policy\nRemove after a deprecation.",
      },
    });
  });

  it("readSkillFile refuses a wrong type, an empty file and a too long one", async () => {
    expect(await readSkillFile(file("skill.pdf", "# x"))).toEqual({ ok: false, error: "wrongType" });
    expect(await readSkillFile(file("skill.md", "  \n "))).toEqual({ ok: false, error: "empty" });
    expect(await readSkillFile(file("skill.txt", "a".repeat(20_001)))).toEqual({ ok: false, error: "tooLong" });
  });
});
