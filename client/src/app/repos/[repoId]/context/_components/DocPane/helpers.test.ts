import { describe, expect, it } from "vitest";
import { copyErrorText, saveErrorText } from "./helpers";

describe("DocPane helpers", () => {
  it("saveErrorText picks the size message only for too_large", () => {
    expect(saveErrorText({ reason: "too_large" }, "x")).toEqual({ key: "errors.tooLarge" });
    expect(saveErrorText(null, "boom")).toEqual({ key: "errors.saveFailed", values: { message: "boom" } });
  });

  it("copyErrorText maps limit, name rule and unknown failures", () => {
    expect(copyErrorText({ reason: "limit_reached", limit: 200 }, "x")).toEqual({
      key: "errors.limitReached",
      values: { limit: 200 },
    });
    expect(copyErrorText({ reason: "invalid_name", rule: "too_long" }, "x")).toEqual({
      key: "errors.invalidName.too_long",
    });
    expect(copyErrorText(null, "boom").key).toBe("errors.saveFailed");
  });
});
