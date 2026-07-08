import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("maps /ci (and its subpaths) to the ci-runs nav key, and leaves other routes unaffected", () => {
    expect(activeKeyFor("/ci")).toBe("ci-runs");
    expect(activeKeyFor("/ci/anything")).toBe("ci-runs");
    // Regression: unrelated routes still resolve as before.
    expect(activeKeyFor("/agents")).toBe("agents");
    expect(activeKeyFor("/skills")).toBe("skills");
    expect(activeKeyFor("/settings/api-keys")).toBe("settings");
    expect(activeKeyFor("/")).toBe("");
  });
});
