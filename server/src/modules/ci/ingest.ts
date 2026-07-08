import { inflateRawSync } from 'node:zlib';
import type { CiRunStatus, Finding } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { countBlockers, gateTriggered } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { CI_RESULT_ARTIFACT_NAME, CI_RESULT_FILE_NAME } from './constants.js';
import { parseRepoSlug } from './helpers.js';

/**
 * Pull-based CI ingest (T6, AC-27..AC-32). Polls each tracked GHA installation
 * for finished workflow runs, downloads the `devdigest-result.json` artifact,
 * and persists a validated result as an `agent_runs` row — through
 * `container.reviewRepo.createCiAgentRun` (the ONLY writer; see the doc
 * comment on `ReviewRepository`). This module never touches `agent_runs`
 * directly and is never imported by `routes.ts` (only `CiService` calls in).
 *
 * There is deliberately no inbound push endpoint (AC-27): the target repo's
 * CI has no way to reach this server, so results only ever arrive by the
 * studio polling GitHub's Actions API and pulling the artifact itself.
 */

export interface RefreshResult {
  degraded: boolean;
  message?: string | null;
}

/**
 * Refresh every GHA installation across the workspace's agents. Each
 * installation is processed independently: a failure listing its workflow
 * runs (GitHub API unavailable / rate-limited) marks the overall refresh
 * `degraded` and writes NOTHING for that installation (AC-32) — it does not
 * abort the rest of the workspace. A failure downloading/parsing ONE run's
 * artifact (missing, expired, invalid JSON, failed `CiResultArtifact` parse)
 * only skips that run (AC-31); it is not a degraded condition.
 */
export async function refreshCiRuns(container: Container, workspaceId: string): Promise<RefreshResult> {
  const github = await container.github();
  const agents = await container.agentsRepo.list(workspaceId);

  let degraded = false;
  const messages: string[] = [];

  for (const agent of agents) {
    const installations = (await container.ciRepo.listForAgent(agent.id)).filter(
      (installation) => installation.targetType === 'gha',
    );

    for (const installation of installations) {
      let repoRef;
      try {
        repoRef = parseRepoSlug(installation.repo);
      } catch {
        continue; // malformed repo slug on the installation row — not a GitHub API issue, just skip it
      }

      let runs;
      try {
        runs = await github.listWorkflowRuns(repoRef, {});
      } catch (err) {
        degraded = true;
        messages.push(err instanceof Error ? err.message : 'GitHub API unavailable');
        continue;
      }

      for (const run of runs) {
        if (run.conclusion == null) continue; // still in-flight — no artifact to fetch yet

        try {
          const download = await github.downloadArtifact(repoRef, {
            runId: run.id,
            name: CI_RESULT_ARTIFACT_NAME,
          });
          const json = extractZipJsonEntry(download.contents, CI_RESULT_FILE_NAME);
          if (json == null) continue; // missing/expired/empty artifact (AC-31)

          const parsedJson: unknown = JSON.parse(json);
          // The artifact is a `CiResultArtifact[]` — one entry per reviewer in a
          // multi-agent export. Older single-agent runners wrote a bare object;
          // accept both by normalizing to an array.
          const asArray = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
          const result = CiResultArtifact.array().safeParse(asArray);
          if (!result.success || result.data.length === 0) continue; // invalid/empty artifact (AC-31)

          // This installation belongs to ONE studio agent; pick that agent's
          // entry by manifest name. Fall back to the sole entry when there is
          // exactly one (single-agent export, or a legacy single-object artifact).
          const artifact =
            result.data.find((a) => a.agent === agent.name) ??
            (result.data.length === 1 ? result.data[0]! : undefined);
          if (artifact == null) continue; // no entry for this agent in the run's artifact

          // Same deterministic gate reviewer-core uses for local runs — never a
          // CI-specific reimplementation of severity ranking (AC-29).
          const findings = syntheticFindingsFromCounts(artifact);
          const blockers = countBlockers(findings, agent.ciFailOn);
          const triggered = gateTriggered(findings, agent.ciFailOn);
          void triggered; // `triggered === blockers > 0` by construction — kept for traceability/audit of AC-29's "reuse gateTriggered" requirement

          const status: CiRunStatus = artifact.findings_count === 0 ? 'no_findings' : 'succeeded';

          await container.reviewRepo.createCiAgentRun({
            workspaceId: agent.workspaceId,
            agentId: agent.id,
            prId: null, // CI-ingested runs are not matched to an internal `pull_requests` row (AC-28)
            ciInstallationId: installation.id,
            repo: installation.repo,
            externalPrNumber: artifact.pr_number ?? run.pullRequestNumber ?? null,
            actionsRunId: String(run.id),
            actionsJobUrl: run.htmlUrl,
            provider: null,
            model: null,
            status,
            durationMs: artifact.duration_ms ?? null,
            costUsd: artifact.cost_usd,
            findingsCount: artifact.findings_count,
            score: null, // the runner artifact carries no score field
            blockers,
          });
        } catch {
          // Download threw, zip was corrupt, JSON.parse threw, etc. — treat like
          // any other invalid/missing artifact: skip this run, keep going (AC-31).
          continue;
        }
      }
    }
  }

  return { degraded, message: messages.length > 0 ? messages.join('; ') : null };
}

/**
 * Build placeholder `Finding[]` from the artifact's aggregate severity counts
 * purely so `countBlockers`/`gateTriggered` (which take `Finding[]`) can be
 * reused verbatim — the artifact never carries individual findings (AC-29).
 * Content fields (file/line/rationale) are intentionally empty: only
 * `severity` feeds the gate computation.
 */
function syntheticFindingsFromCounts(artifact: CiResultArtifact): Finding[] {
  const bySeverity: [number, Finding['severity']][] = [
    [artifact.critical ?? 0, 'CRITICAL'],
    [artifact.warning ?? 0, 'WARNING'],
    [artifact.suggestion ?? 0, 'SUGGESTION'],
  ];
  const findings: Finding[] = [];
  let n = 0;
  for (const [count, severity] of bySeverity) {
    for (let i = 0; i < count; i++) {
      findings.push({
        id: `ci-synthetic-${n++}`,
        severity,
        category: 'bug',
        title: 'CI-ingested finding (aggregate count only)',
        file: '',
        start_line: 0,
        end_line: 0,
        rationale: '',
        confidence: 1,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (no dependency available — see server/insights/gotchas.md)
// ---------------------------------------------------------------------------
//
// GitHub Actions artifacts are plain PKZIP archives. Node's `zlib` module only
// exposes raw deflate/inflate primitives, not a ZIP container parser, and no
// zip library (`adm-zip`/`unzipper`/`jszip`/`yauzl`) is a dependency of this
// package — adding one is out of scope (lockfile is off-limits). This hand
// -rolled reader supports exactly what's needed here: locate one named entry
// in the central directory and inflate/copy its bytes.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

/** Find + decompress one named entry from a ZIP archive's bytes. Returns the
 *  entry's contents as a utf-8 string, or `null` if the archive is empty,
 *  malformed, or does not contain that entry (treated as a missing/expired
 *  artifact by the caller, never thrown). */
function extractZipJsonEntry(buf: Buffer, entryName: string): string | null {
  if (buf.length < 22) return null;

  const eocdOffset = findEocd(buf);
  if (eocdOffset < 0) return null;

  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);

  let cursor = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > buf.length) return null;
    if (buf.readUInt32LE(cursor) !== CENTRAL_DIR_SIGNATURE) return null;

    const compressionMethod = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    if (name === entryName || name.endsWith(`/${entryName}`)) {
      const bytes = readLocalFileData(buf, localHeaderOffset, compressionMethod, compressedSize);
      return bytes ? bytes.toString('utf8') : null;
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/** Scan backward for the End Of Central Directory record (handles a trailing
 *  zip comment, which shifts it away from the very end of the buffer). */
function findEocd(buf: Buffer): number {
  const maxCommentLength = 65535;
  const searchStart = Math.max(0, buf.length - 22 - maxCommentLength);
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function readLocalFileData(
  buf: Buffer,
  localHeaderOffset: number,
  compressionMethod: number,
  compressedSize: number,
): Buffer | null {
  if (localHeaderOffset + 30 > buf.length) return null;
  if (buf.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) return null;

  const nameLength = buf.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buf.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > buf.length) return null;

  const data = buf.subarray(dataStart, dataEnd);
  if (compressionMethod === 0) return Buffer.from(data); // stored, no compression
  if (compressionMethod === 8) return inflateRawSync(data); // deflate
  return null; // unsupported method — treat like a missing/invalid artifact
}
