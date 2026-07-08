import type { CiFile } from "@devdigest/shared";
import type { CategorizedFiles, TriggerState } from "./types";

/**
 * Splits the flat `CiFile[]` returned by `POST /agents/:id/export-ci` into the
 * four artifact categories the Preview step lists (AC-3): the manifest, one
 * file per linked skill, the (empty) memory log, and the workflow file.
 *
 * Path conventions mirror the studio's manifest layout (`AgentManifest` docs):
 * `.devdigest/agents/<slug>.yaml` for the manifest, `.devdigest/skills/<slug>.md`
 * for skills, and anything ending in `memory.jsonl` for the memory log. Whatever
 * single file remains (the CI-native config — GHA workflow YAML, CircleCI
 * config.yml, Jenkinsfile, or CLI script) is treated as "the workflow file".
 */
export function categorizeFiles(files: CiFile[]): CategorizedFiles {
  const result: CategorizedFiles = { manifest: null, skills: [], memory: null, workflow: null };
  for (const file of files) {
    if (file.path.endsWith("memory.jsonl")) {
      result.memory = file;
    } else if (file.path.includes("/skills/") && file.path.endsWith(".md")) {
      result.skills.push(file);
    } else if (file.path.includes("/agents/") && /\.ya?ml$/.test(file.path)) {
      result.manifest = file;
    } else {
      result.workflow = file;
    }
  }
  return result;
}

/** Converts the toggle state into the ordered trigger list the API expects. */
export function triggersToList(triggers: TriggerState): string[] {
  return (Object.keys(triggers) as (keyof TriggerState)[]).filter((key) => triggers[key]);
}

/** Replaces the workflow file's contents in-place, preserving the rest of the
 *  bundle — used when the user edits the workflow textarea on the Preview step
 *  so the edit persists through Configure into Install (AC-4). */
export function withEditedWorkflow(files: CiFile[], workflowPath: string, contents: string): CiFile[] {
  return files.map((file) => (file.path === workflowPath ? { ...file, contents } : file));
}
