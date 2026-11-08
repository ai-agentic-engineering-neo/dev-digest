import { describe, it, expect } from "vitest";
import { shortPath } from "./helpers";

describe("shortPath", () => {
  it("keeps the last two segments behind an ellipsis", () => {
    expect(shortPath("client/src/app/_components/FileCard/FileCard.tsx")).toBe("…/FileCard/FileCard.tsx");
  });

  it("leaves short paths untouched", () => {
    expect(shortPath("src/a.ts")).toBe("src/a.ts");
    expect(shortPath("server.ts")).toBe("server.ts");
  });
});
