/* Drift guard (D6): the client mirror PrBlastRadius must have the same key shape as the server's
   golden fixture. This reads DATA (a JSON fixture) from server/test/fixtures — it does not import
   server code. tsc rejects extra/missing keys in `sample`; the test compares the runtime shape. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PrBlastRadius } from "./types";

type Shape = string | Shape[] | { [key: string]: Shape };

/** Recursively maps a JSON value to its key/type shape (arrays by their first element). */
function keyShape(value: unknown): Shape {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length > 0 ? [keyShape(value[0])] : [];
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, keyShape(v)]),
    );
  }
  return typeof value;
}

const sample: PrBlastRadius = {
  pr_id: "00000000-0000-4000-8000-000000000001",
  head_sha: "abc123",
  indexed_sha: "def456",
  link_sha: "def456",
  changed_symbols: [{ name: "doThing", file: "src/a.ts", kind: "function" }],
  downstream: [
    {
      symbol: "doThing",
      file: "src/a.ts",
      kind: "function",
      callers: [{ name: "run", file: "src/b.ts", line: 10 }],
      endpoints_affected: ["GET /things"],
      crons_affected: ["nightly"],
    },
  ],
  unattributed_endpoints: ["POST /other"],
  summary: "1 symbol, 1 caller",
  counts: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
  callers_omitted: 0,
  degraded: false,
  reason: null,
};

describe("PrBlastRadius client mirror", () => {
  it("has the same key shape as the server golden fixture", () => {
    const fixture: unknown = JSON.parse(
      readFileSync(resolve(__dirname, "../../../server/test/fixtures/blast-radius-response.json"), "utf8"),
    );
    expect(keyShape(sample)).toEqual(keyShape(fixture));
  });
});
