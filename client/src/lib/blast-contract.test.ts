/* Drift guard (D6): the client mirror PrBlastRadius must have the same key shape as the server's
   golden fixture. This reads DATA (a JSON fixture) from server/test/fixtures — it does not import
   server code. tsc rejects extra/missing keys in `sample`; the test compares the runtime shape. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en/blast.json";
import { BLAST_DEGRADED_REASONS, type PrBlastRadius, type PriorPull, type PriorPullsResponse } from "./types";

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

  it("has the server's degraded reasons, each with a message (no MISSING_MESSAGE at runtime)", () => {
    // Read the server source as TEXT (no cross-package import) and pull out the `as const` list.
    const src = readFileSync(resolve(__dirname, "../../../server/src/modules/blast/domain/types.ts"), "utf8");
    const list = /BLAST_DEGRADED_REASONS\s*=\s*\[([^\]]*)\]/.exec(src)?.[1];
    expect(list, "BLAST_DEGRADED_REASONS not found in server domain/types.ts").toBeDefined();
    const serverReasons = [...list!.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    expect(serverReasons.length).toBeGreaterThan(0);
    expect([...BLAST_DEGRADED_REASONS]).toEqual(serverReasons);
    for (const reason of serverReasons) {
      expect(messages.degraded, `messages/en/blast.json is missing degraded.${reason}`).toHaveProperty(reason!);
    }
  });
});

/** Field names of `export interface <name> { … }` in a server source file (read as text, not imported). */
function serverInterfaceKeys(src: string, name: string): string[] {
  const body = new RegExp(`export interface ${name} \\{([^}]*)\\}`).exec(src)?.[1];
  if (body === undefined) throw new Error(`interface ${name} not found in server domain/types.ts`);
  return [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]!).sort();
}

describe("PriorPulls client mirrors", () => {
  const src = readFileSync(resolve(__dirname, "../../../server/src/modules/blast/domain/types.ts"), "utf8");

  // tsc rejects missing/extra keys in these samples, so their keys ARE the client types' keys.
  const pull: PriorPull = {
    pr_id: "00000000-0000-4000-8000-000000000002",
    number: 1,
    title: "t",
    author: "a",
    status: "open",
    updated_at: null,
    shared_count: 1,
    shared_files: ["a.ts"],
  };
  const response: PriorPullsResponse = { pr_id: "00000000-0000-4000-8000-000000000001", total: 1, pulls: [pull] };

  it("PriorPull has exactly the server's fields", () => {
    expect(Object.keys(pull).sort()).toEqual(serverInterfaceKeys(src, "PriorPull"));
  });

  it("PriorPullsResponse has exactly the server's fields", () => {
    expect(Object.keys(response).sort()).toEqual(serverInterfaceKeys(src, "PriorPullsResponse"));
  });
});
