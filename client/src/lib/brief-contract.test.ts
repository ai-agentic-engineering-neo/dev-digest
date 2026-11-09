/* Drift guard: client mirrors of the PR Brief must match the server. Reads server files as TEXT/JSON
   (no server import). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import briefMessages from "../../messages/en/brief.json";
import blastMessages from "../../messages/en/blast.json";
import { FEATURE_MODELS } from "./feature-models";
import { BLAST_DEGRADED_REASONS, type PrBriefResponse } from "./types";

type Shape = string | Shape[] | { [key: string]: Shape };

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

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

const sample: PrBriefResponse = {
  pr_id: "6f1c1a52-3b0e-4a57-9c1d-2f6a8b7d9e10",
  model: { provider: "openrouter", model: "deepseek/deepseek-v4-flash" },
  changed_files: 3,
  generating: false,
  outdated: false,
  brief: {
    summary: "s",
    risks: [
      {
        kind: "auth",
        title: "t",
        explanation: "e",
        severity: "high",
        file_refs: ["a.ts:1-2"],
        refs: [{ ref: "a.ts:1-2", path: "a.ts", start_line: 1, end_line: 2, in_diff: true }],
      },
    ],
    review_focus: [{ file: "a.ts", line: 1, file_level: false, in_diff: true, reason: "r" }],
    missing_inputs: [{ input: "intent", reason: "not_derived" }],
    truncated: { spec_docs: 0, callers: 0, boilerplate_hunk_files: 0 },
    head_sha: "abc",
    blast_link_sha: "abc",
    usage: { provider: "openrouter", model: "m", tokens_in: 1, tokens_out: 1, cost_usd: null },
    generated_at: "2026-11-09T10:00:00.000Z",
  },
};

describe("PR Brief client mirror", () => {
  it("has the same key shape as the server golden fixture", () => {
    const fixture: unknown = JSON.parse(read("../../../server/test/fixtures/brief-response.json"));
    expect(keyShape(sample)).toEqual(keyShape(fixture));
  });

  it("risk_brief default model equals the server DEFAULT_BRIEF_MODEL", () => {
    const src = read("../../../server/src/modules/brief/constants.ts");
    const m = /DEFAULT_BRIEF_MODEL\s*=\s*\{\s*provider:\s*['"]([^'"]+)['"],\s*model:\s*['"]([^'"]+)['"]/.exec(src);
    expect(m, "DEFAULT_BRIEF_MODEL not found in server constants.ts").not.toBeNull();
    const entry = FEATURE_MODELS.find((f) => f.id === "risk_brief");
    expect(entry?.defaultProvider).toBe(m![1]);
    expect(entry?.defaultModel).toBe(m![2]);
  });

  it("blast reason copy equals the Blast block's and covers every reason", () => {
    expect(briefMessages.missing.blastReason).toEqual(blastMessages.degraded);
    for (const reason of BLAST_DEGRADED_REASONS) {
      expect(briefMessages.missing.blastReason).toHaveProperty(reason);
    }
  });
});
