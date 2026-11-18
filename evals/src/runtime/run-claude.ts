/**
 * The headless turn-loop driver. Runs one Claude Agent SDK session on the subscription and
 * extracts what the session ACTUALLY did (tools, subagents, skills, reads) — not its prose.
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { DISALLOWED_TOOLS, EVAL_MODEL, MAX_TURNS, SPAWN_TOOLS } from "../config.js";
import { REPO_ROOT } from "../artifacts/paths.js";
import { subscriptionEnv } from "./env.js";

export interface Metrics {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Total tool_use blocks seen (NOT deduplicated — a measure of work done). */
  toolCallCount: number;
}

export interface Result {
  text: string;
  toolsUsed: string[];
  subagents: string[];
  /** Skills activated via the Skill tool (workflow mode); name may be "plugin:skill". */
  skillsInvoked: string[];
  filesRead: string[];
  numTurns: number;
  isError: boolean;
  metrics: Metrics;
}

export interface RunOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  cwd?: string;
  model?: string;
  /** ["project"] loads on-disk CLAUDE.md + skills/agents; default [] keeps the run isolated. */
  settingSources?: Array<"user" | "project" | "local">;
}

/** Run one headless Claude turn-loop and extract what it ACTUALLY did (not its prose). */
export async function runClaude(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const allowedTools = opts.allowedTools ?? [];
  // With no tools, a subagent/skill prompt that says "read files" will loop on denied tool
  // calls until max-turns. For these content-only evals the input is already in the prompt,
  // so tell the model to answer directly.
  let systemPrompt = opts.systemPrompt;
  if (allowedTools.length === 0) {
    const directive =
      "\n\nYou have NO tools available in this session. Do not attempt any tool calls. " +
      "Answer directly and completely from the information given in the prompt.";
    systemPrompt = (systemPrompt ?? "") + directive;
  }

  const options: Options = {
    model: opts.model ?? EVAL_MODEL,
    maxTurns: opts.maxTurns ?? MAX_TURNS,
    // S5 (plans/18-security-fixes.md): `bypassPermissions` approves EVERY tool
    // call, so `allowedTools` was only a hint and the model under test could
    // run Bash/Write in the checkout. `dontAsk` denies anything not in
    // `allowedTools`; `disallowedTools` removes the mutating tools outright as
    // a second line, including for any subagent the session spawns.
    permissionMode: "dontAsk",
    systemPrompt,
    allowedTools,
    disallowedTools: [...DISALLOWED_TOOLS],
    cwd: opts.cwd ?? REPO_ROOT,
    // Default: do NOT load on-disk config — isolates the injected artifact. workflowTask overrides.
    settingSources: opts.settingSources ?? [],
    env: subscriptionEnv(),
  };

  const textParts: string[] = [];
  const tools: string[] = [];
  const subagents: string[] = [];
  const skills: string[] = [];
  const reads: string[] = [];
  let resultText = "";
  let isError = false;
  let numTurns = 0;
  let toolCallCount = 0;
  // Resource metrics, read defensively off the result message (field names verified against the
  // installed SDK's types). On the subscription path total_cost_usd is meaningless, so we ignore
  // it and surface tokens only. Fall back to 0 whenever a field is absent — never throw.
  let durationMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  // The SDK throws on an error result (e.g. max-turns). We still want the partial output
  // and the tool/subagent trace we collected, so catch and fall through with isError=true.
  try {
    for await (const msg of query({ prompt, options })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content as any[]) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") {
            tools.push(block.name);
            toolCallCount++;
            const input = block.input ?? {};
            if (SPAWN_TOOLS.has(block.name)) {
              const sub = input.subagent_type ?? input.agent_type ?? input.name;
              if (sub) subagents.push(sub);
            }
            if (block.name === "Read") {
              const fp = input.file_path ?? input.path;
              if (fp) reads.push(fp);
            }
            if (block.name === "Skill") {
              const s = input.skill ?? input.command;
              if (s) skills.push(s);
            }
          }
        }
      } else if (msg.type === "result") {
        isError = msg.subtype !== "success";
        const m = msg as any;
        numTurns = m.num_turns ?? 0;
        durationMs = m.duration_ms ?? 0;
        inputTokens = m.usage?.input_tokens ?? 0;
        outputTokens = m.usage?.output_tokens ?? 0;
        if (m.result) resultText = m.result;
      }
    }
  } catch (err) {
    isError = true;
    if (!resultText && textParts.length === 0) {
      throw err; // nothing usable collected — surface the failure
    }
  }

  return {
    text: resultText || textParts.join("\n"),
    toolsUsed: [...new Set(tools)],
    subagents: [...new Set(subagents)],
    skillsInvoked: [...new Set(skills)],
    filesRead: reads,
    numTurns,
    isError,
    metrics: { durationMs, inputTokens, outputTokens, toolCallCount },
  };
}
