import { describe, it, expect } from "vitest";
import { candidate } from "../../_test/harness";
import { acceptedOf, groundedCount } from "./helpers";

describe("acceptedOf", () => {
  it("keeps only accepted candidates, in order", () => {
    const list = [
      candidate({ id: "1", status: "accepted" }),
      candidate({ id: "2", status: "pending" }),
      candidate({ id: "3", status: "accepted" }),
    ];
    expect(acceptedOf(list).map((c) => c.id)).toEqual(["1", "3"]);
  });
});

describe("groundedCount", () => {
  it("is proposed minus the ungrounded drops, never negative", () => {
    expect(groundedCount({ proposed: 12, dropped_ungrounded: 5 })).toBe(7);
    expect(groundedCount({ proposed: 2, dropped_ungrounded: 5 })).toBe(0);
  });
});
