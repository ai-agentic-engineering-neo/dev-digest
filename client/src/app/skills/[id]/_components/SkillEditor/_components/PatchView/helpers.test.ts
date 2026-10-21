import { describe, it, expect } from "vitest";
import { classifyPatch } from "./helpers";

describe("classifyPatch", () => {
  it("treats file headers as meta only before the first hunk, and -- / ++ body lines as changes", () => {
    const patch = ["--- a", "+++ b", "@@ -1,2 +1,2 @@", " same", "----", "++ added", "-gone"].join("\n") + "\n";
    expect(classifyPatch(patch).map((l) => l.kind)).toEqual(["meta", "meta", "hunk", "ctx", "del", "add", "del"]);
  });
});
