import { describe, it, expect } from "vitest";
import { dataUrlToBase64 } from "./helpers";

describe("dataUrlToBase64", () => {
  it("strips the data-URL prefix", () => {
    expect(dataUrlToBase64("data:text/markdown;base64,QUJD")).toBe("QUJD");
  });

  it("returns the string unchanged when there is no comma", () => {
    expect(dataUrlToBase64("QUJD")).toBe("QUJD");
  });
});
