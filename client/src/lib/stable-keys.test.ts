import { describe, it, expect } from "vitest";
import { dedupeKeys } from "./stable-keys";

describe("dedupeKeys", () => {
  it("keeps first occurrences and suffixes repeats", () => {
    expect(dedupeKeys(["a", "b", "a", "a"])).toEqual(["a", "b", "a#1", "a#2"]);
  });
});
