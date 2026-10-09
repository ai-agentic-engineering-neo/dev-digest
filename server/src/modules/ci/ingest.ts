import { unzipSync, strFromU8 } from 'fflate';
import { CiResultArtifact, CiRunMeta } from '@devdigest/shared';
import { containsSecretShapedValue, findSecretShapedString } from './redact.js';
import { RESULT_FILENAME, RUN_META_FILENAME } from './constants.js';

/**
 * specs/14-export-to-ci.md (P4, security-critical) — the untrusted-input
 * boundary. Pure: no DB, no HTTP (the caller already fetched the artifact
 * bytes). AC-18's four checks each run independently and each failure is
 * named — "authenticated as a workspace member" is check #1, proven by the
 * CALLER already having resolved a workspace via `getContext` before this
 * function is ever invoked (never re-proven here, since this module has no
 * request of its own to authenticate).
 */

const ARCHIVE_ENTRY_LIMIT = 64;
// Both files are small JSON documents; anything larger is already abusive.
const MAX_ENTRY_BYTES = 256 * 1024;

/** Absolute path, drive letter, or any `..` segment — refused outright.
 *  Mirrors `modules/skills/helpers.ts`'s `isUnsafeEntryPath` exactly. */
function isUnsafeEntryPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return true;
  if (/^[A-Za-z]:\//.test(normalized)) return true;
  return normalized.split('/').includes('..');
}

/**
 * Read ONLY the two known entry names out of the zip and ignore everything
 * else — mirrors `modules/skills/helpers.ts`'s `extractSkillFromZip`: a
 * `filter` that inflates only known names (fflate never decompresses what
 * the filter rejects), an entry-count cap, a per-entry size cap, and an
 * unsafe-path refusal, all enforced BEFORE any content is trusted. Never
 * inflate the whole archive first.
 */
function readArtifactZip(bytes: Uint8Array): { result: string | null; meta: string | null } {
  const names: string[] = [];
  let oversize = false;
  const files = unzipSync(bytes, {
    filter: (file) => {
      names.push(file.name);
      if (names.length > ARCHIVE_ENTRY_LIMIT) return false;
      const base = file.name.split('/').pop();
      if (base !== RESULT_FILENAME && base !== RUN_META_FILENAME) return false;
      if (file.originalSize > MAX_ENTRY_BYTES) {
        oversize = true;
        return false;
      }
      return true;
    },
  });

  if (names.length > ARCHIVE_ENTRY_LIMIT) {
    throw new Error(`Artifact has more than ${ARCHIVE_ENTRY_LIMIT} entries; refusing to read it`);
  }
  const unsafe = names.find(isUnsafeEntryPath);
  if (unsafe) throw new Error(`Artifact contains an unsafe entry path: ${unsafe}`);
  if (oversize) throw new Error(`Artifact entry exceeds ${MAX_ENTRY_BYTES} bytes`);

  const resultEntry = Object.keys(files).find((n) => n.split('/').pop() === RESULT_FILENAME);
  const metaEntry = Object.keys(files).find((n) => n.split('/').pop() === RUN_META_FILENAME);
  return {
    result: resultEntry ? strFromU8(files[resultEntry]!) : null,
    meta: metaEntry ? strFromU8(files[metaEntry]!) : null,
  };
}

export interface IngestCheckInput {
  /** The raw artifact zip bytes (containing both `devdigest-result.json` and
   *  the D-P2 `devdigest-run.json` sidecar), or `null` when the provider run
   *  published no artifact at all (AC-21 — handled by the caller, not this
   *  function). */
  zipBytes: Uint8Array;
  /** The commit the PROVIDER reports this run was built from (e.g. the
   *  workflow run's `head_sha`) — check #3 compares the sidecar's claimed
   *  commit against this. */
  providerHeadSha: string;
  /** The installation's own stored repo (`owner/name`) — check #4 compares
   *  the sidecar's claimed repository against this. */
  installationRepo: string;
}

export type IngestCheckResult =
  | { ok: true; artifact: CiResultArtifact; meta: CiRunMeta }
  | { ok: false; failedCheck: string };

/**
 * AC-18 — checks #2–4 (schema conformance, commit match, repository match),
 * in order, each independently verifiable and named on failure. AC-63's
 * secret-shaped-value rejection runs alongside (defence in depth,
 * independent of the runner's own guarantee not to emit one) — checked on
 * the RAW text before any field is parsed/stored, and again on the typed
 * result for values that only look secret-shaped once unescaped.
 */
export function checkIngestArtifact(input: IngestCheckInput): IngestCheckResult {
  let raw: { result: string | null; meta: string | null };
  try {
    raw = readArtifactZip(input.zipBytes);
  } catch (err) {
    return { ok: false, failedCheck: `unsafe_archive: ${(err as Error).message}` };
  }
  if (!raw.result || !raw.meta) {
    return { ok: false, failedCheck: 'schema_conformance: missing result or run-metadata file' };
  }

  // AC-63 — before any JSON.parse/schema validation touches the text.
  if (containsSecretShapedValue(raw.result) || containsSecretShapedValue(raw.meta)) {
    return { ok: false, failedCheck: 'credential_shaped_value' };
  }

  let parsedResultJson: unknown;
  let parsedMetaJson: unknown;
  try {
    parsedResultJson = JSON.parse(raw.result);
    parsedMetaJson = JSON.parse(raw.meta);
  } catch {
    return { ok: false, failedCheck: 'schema_conformance: not valid JSON' };
  }

  // Check #2 — schema conformance.
  const resultParse = CiResultArtifact.safeParse(parsedResultJson);
  if (!resultParse.success) {
    return { ok: false, failedCheck: 'schema_conformance: devdigest-result.json' };
  }
  const metaParse = CiRunMeta.safeParse(parsedMetaJson);
  if (!metaParse.success) {
    return { ok: false, failedCheck: 'schema_conformance: devdigest-run.json' };
  }

  if (findSecretShapedString(resultParse.data) || findSecretShapedString(metaParse.data)) {
    return { ok: false, failedCheck: 'credential_shaped_value' };
  }

  // Check #3 — commit match.
  if (metaParse.data.commit_sha !== input.providerHeadSha) {
    return { ok: false, failedCheck: 'commit_mismatch' };
  }
  // Check #4 — repository match.
  if (metaParse.data.repository !== input.installationRepo) {
    return { ok: false, failedCheck: 'repository_mismatch' };
  }

  return { ok: true, artifact: resultParse.data, meta: metaParse.data };
}
