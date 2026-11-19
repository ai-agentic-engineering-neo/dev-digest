import { describe, it, expect, vi } from "vitest";

/** S5 (plans/18-security-fixes.md) — the model under test runs read-only and without secrets. */

const captured: { options?: Record<string, unknown> } = {};
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ options }: { options: Record<string, unknown> }) => {
    captured.options = options;
    return (async function* () {
      yield { type: "result", subtype: "success", result: "ok", num_turns: 1, duration_ms: 1, usage: {} };
    })();
  },
}));

describe("runClaude sandbox options", () => {
  it("never uses bypassPermissions and always disallows mutating tools", async () => {
    const { runClaude } = await import("./run-claude.js");
    await runClaude("hi", { allowedTools: ["Read"] });
    expect(captured.options?.permissionMode).toBe("dontAsk");
    expect(captured.options?.disallowedTools).toEqual(
      expect.arrayContaining(["Bash", "Write", "Edit", "NotebookEdit"]),
    );
    expect(captured.options?.allowedTools).toEqual(["Read"]);
  });
});

describe("scrubSecrets", () => {
  it("drops credentials but keeps the SDK's own auth and ordinary vars", async () => {
    const { scrubSecrets } = await import("./env.js");
    const env = scrubSecrets({
      PATH: "/bin",
      HOME: "/home/x",
      OPENROUTER_API_KEY: "sk-or",
      GITHUB_TOKEN: "ghp",
      OPENAI_API_KEY: "sk",
      DB_PASSWORD: "pw",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth",
      ANTHROPIC_API_KEY: "ak",
    });
    expect(env).toEqual({
      PATH: "/bin",
      HOME: "/home/x",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth",
      ANTHROPIC_API_KEY: "ak",
    });
  });
});
