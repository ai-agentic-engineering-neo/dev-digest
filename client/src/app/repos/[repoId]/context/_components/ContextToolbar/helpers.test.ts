import { describe, expect, it } from "vitest";
import messages from "../../../../../../../messages/en/context.json";
import { childFolder, folderLabel, reasonText, type Translate } from "./helpers";

const t: Translate = (key, values) => {
  const raw = key.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], messages);
  let text = String(raw);
  for (const [k, v] of Object.entries(values ?? {})) text = text.replace(`{${k}}`, String(v));
  return text;
};

describe("ContextToolbar helpers", () => {
  it("maps every rejection to its message", () => {
    expect(reasonText(t, { reason: "invalid_name", rule: "dot_dot" })).toBe("Names can't contain “..”.");
    expect(reasonText(t, { reason: "exists", path: ".devdigest/specs/a.md" })).toBe(
      ".devdigest/specs/a.md already exists.",
    );
    expect(reasonText(t, { reason: "limit_reached", limit: 200 })).toContain("200");
    expect(reasonText(t, { reason: "too_large" })).toBe("Over the 1 MB limit.");
    expect(reasonText(t, { reason: "not_markdown" })).toBe("Not a .md file.");
    expect(reasonText(t, { reason: "not_text" })).toBe("Not a UTF-8 text file.");
  });

  it("builds folder paths", () => {
    expect(folderLabel("auth")).toBe(".devdigest/specs/auth");
    expect(childFolder("", "x")).toBe("x");
    expect(childFolder("auth", "x")).toBe("auth/x");
  });
});
