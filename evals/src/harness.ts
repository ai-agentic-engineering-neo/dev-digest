/**
 * Shared eval infrastructure for the DevDigest Claude Code harness.
 *
 * Everything runs through the Claude Agent SDK on the **Claude Code subscription** — the
 * API key is stripped from the child environment, so calls use the login / credential
 * helper, never per-token API billing. No external services, no third-party judge.
 *
 * Three ways to run a case, all subscription-only:
 *   - skillTask / agentTask — inject an artifact's content as the system prompt. This
 *     measures the artifact's CONTENT in isolation (no disk config is loaded — see note
 *     on settingSources below), which is deliberate for skill/agent quality.
 *   - workflowTask — load the on-disk harness (CLAUDE.md + project skills/agents) via
 *     settingSources:["project"], to measure the SYSTEMIC effect: does a skill actually
 *     activate, does a subagent get dispatched, does CLAUDE.md change behavior.
 *
 * Two scorers:
 *   - patternMatch(output, expected) — deterministic substring coverage, no model.
 *   - llmJudge(output, practices)    — one structured query() → strict JSON PASS/FAIL per
 *     practice, PASS only with a verbatim evidence quote (the LLM Message Pattern).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVALS_DIR = join(HERE, "..");
export const REPO_ROOT = join(EVALS_DIR, "..");
export const SKILLS_DIR = join(REPO_ROOT, ".claude", "skills");
export const AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");

// Cheap by default; the judge is a stronger family to soften single-model self-preference.
export const EVAL_MODEL = process.env.EVAL_MODEL ?? "claude-haiku-4-5";
export const EVAL_JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-sonnet-5";
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");

const SPAWN_TOOLS = new Set(["Task", "Agent"]); // subagent-spawning tool name varies by harness

/** Child env with any API key removed → forces the subscription/credential path. */
function subscriptionEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
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
    permissionMode: "bypassPermissions", // safe: evals only read/plan and tools are allow-listed
    systemPrompt,
    allowedTools,
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

  // The SDK throws on an error result (e.g. max-turns). We still want the partial output
  // and the tool/subagent trace we collected, so catch and fall through with isError=true.
  try {
    for await (const msg of query({ prompt, options })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content as any[]) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") {
            tools.push(block.name);
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
        numTurns = (msg as any).num_turns ?? 0;
        if ((msg as any).result) resultText = (msg as any).result;
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
  };
}

// ---------------------------------------------------------------------------
// Loading a skill / agent as a system prompt (measures the artifact's content)
// ---------------------------------------------------------------------------

function stripFrontmatter(md: string): string {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(end + 4).replace(/^\n+/, "");
  }
  return md;
}

export function skillContent(skillName: string): string {
  const dir = join(SKILLS_DIR, skillName);
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) throw new Error(`SKILL.md not found: ${skillMd}`);
  const parts = [readFileSync(skillMd, "utf8")];
  const refs = join(dir, "references");
  if (existsSync(refs)) {
    for (const f of readdirSync(refs).filter((f) => f.endsWith(".md")).sort()) {
      parts.push(`\n\n## Reference: ${f}\n\n${readFileSync(join(refs, f), "utf8")}`);
    }
  }
  return parts.join("\n");
}

export function agentContent(agentName: string): string {
  const f = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(f)) throw new Error(`agent not found: ${f}`);
  return stripFrontmatter(readFileSync(f, "utf8"));
}

/** Run a prompt with a skill's content injected (the 'treatment' condition). */
export function skillTask(prompt: string, skillName: string, opts: RunOptions = {}) {
  return runClaude(prompt, { ...opts, systemPrompt: skillContent(skillName) });
}

/** Run a prompt with a subagent's definition injected as the system prompt. */
export function agentTask(prompt: string, agentName: string, opts: RunOptions = {}) {
  return runClaude(prompt, { ...opts, systemPrompt: agentContent(agentName) });
}

/**
 * Run a prompt against the REAL on-disk harness (CLAUDE.md + project skills/agents loaded).
 * Use for workflow-level evals: skill activation, subagent dispatch, CLAUDE.md effect.
 *
 * Safety: keep allowedTools a read-only allow-list (no Bash/Write/Edit) — a fresh session
 * with bypassPermissions could otherwise take real actions in the repo.
 */
export function workflowTask(prompt: string, opts: RunOptions = {}) {
  return runClaude(prompt, {
    allowedTools: ["Read", "Grep", "Glob", "Task", "Agent", "Skill"],
    ...opts,
    settingSources: ["project"],
  });
}

// ---------------------------------------------------------------------------
// Scorers (both subscription-only)
// ---------------------------------------------------------------------------

/** Fraction of expected substrings present in the output. Deterministic, no model. */
export function patternMatch(output: string, expected: string[]): number {
  if (expected.length === 0) return 1;
  const low = output.toLowerCase();
  return expected.filter((e) => low.includes(e.toLowerCase())).length / expected.length;
}

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

function parseVerdict(text: string): Verdict["results"] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/** LLM Message Pattern judge on the subscription. Judge model defaults to a stronger family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runClaude(prompt, { allowedTools: [], maxTurns: 1, model });
  const results = parseVerdict(res.text);
  const total = results.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total };
}
