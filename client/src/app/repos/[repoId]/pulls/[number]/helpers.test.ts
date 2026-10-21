import { describe, it, expect } from "vitest";
import { diffDeepLinkSearch } from "./helpers";

describe("diffDeepLinkSearch", () => {
  it("sets tab, file and line in one string and keeps unrelated params", () => {
    const out = diffDeepLinkSearch(new URLSearchParams("trace=r1&tab=overview"), "src/a.ts", 12);
    const sp = new URLSearchParams(out);
    expect(sp.get("tab")).toBe("diff");
    expect(sp.get("file")).toBe("src/a.ts");
    expect(sp.get("line")).toBe("12");
    expect(sp.get("trace")).toBe("r1");
  });

  it("drops a stale line when the new target has none", () => {
    const sp = new URLSearchParams(diffDeepLinkSearch(new URLSearchParams("line=7&file=old.ts"), "new.ts", null));
    expect(sp.get("file")).toBe("new.ts");
    expect(sp.has("line")).toBe(false);
  });
});
