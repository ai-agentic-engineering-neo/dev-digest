import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { commonErrorMessage } from '../http/errors.js';
import { resolveRepo } from '../resolvers/repo.js';

export const getOnboardingTourInputSchema = z.object({
  repo: z.string().min(1).describe('Repository identifier: "owner/name", or just "name" if unambiguous.'),
});
export type GetOnboardingTourInput = z.infer<typeof getOnboardingTourInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/10-onboarding-generator.md AC-47..AC-49). */
export const GET_ONBOARDING_TOUR_DESCRIPTION =
  'Returns this repository\'s current Onboarding Tour: either the last stored five-section tour (architecture, critical paths, how to run locally, guided reading path, first tasks) or, if none has been generated yet, the deterministic skeleton of detected facts (stack, ranked files, setup steps, routes) together with a status and a reason. This tool is READ-ONLY — it never triggers a generation and never causes an LLM call or any spend, no matter what it finds, so it is safe to call repeatedly. A "skeleton" or "degraded" status means this repo has no generated tour yet (or its index is degraded) — it does NOT mean the repository itself has no structure; the returned facts still describe what the index does know. Generating a tour is only available from the Dev Digest web UI today, not from this tool.';

/** Subset of `@devdigest/shared`'s `OnboardingEntry` contract this tool reads. */
interface RawOnboardingEntry {
  path: string;
  chain?: string[] | null;
  reason?: string | null;
}

/** Subset of `@devdigest/shared`'s `OnboardingSection` contract this tool reads. */
interface RawOnboardingSection {
  kind: string;
  title: string;
  body: string;
  diagram?: string | null;
  entries?: RawOnboardingEntry[] | null;
}

/** Subset of `@devdigest/shared`'s `Onboarding` contract this tool reads. */
interface RawOnboarding {
  sections: RawOnboardingSection[];
}

/** Subset of `@devdigest/shared`'s `OnboardingProvenance` contract this tool reads. */
interface RawOnboardingProvenance {
  files_indexed: number;
  files_excluded: number;
  index_status: string;
  index_reason?: string | null;
  prs_weighted: number;
  generated_at?: string | null;
  model?: string | null;
}

/** Subset of `@devdigest/shared`'s `OnboardingEvidence` contract this tool reads. */
interface RawOnboardingEvidence {
  value: string;
  evidence_file?: string | null;
}

/** Subset of `@devdigest/shared`'s `OnboardingFacts` contract this tool reads. */
interface RawOnboardingFacts {
  stack: {
    language?: RawOnboardingEvidence | null;
    runtime?: RawOnboardingEvidence | null;
    package_manager?: RawOnboardingEvidence | null;
    frameworks: RawOnboardingEvidence[];
  };
  ranked_files: { path: string; pagerank: number; hotness: number; weighted: number }[];
  setup_steps: { command: string; kind: string; evidence_file: string }[];
  routes: { file: string; endpoints: string[]; crons: string[] }[];
}

/** `GET /repos/:id/tour`'s response envelope (specs/10-onboarding-generator.md §Approach 2). */
interface RawOnboardingPage {
  status: string;
  reason?: string | null;
  stale: boolean;
  provenance: RawOnboardingProvenance;
  facts: RawOnboardingFacts;
  tour: RawOnboarding | null;
}

export interface ConciseOnboardingTour {
  repo: string;
  status: string;
  reason?: string;
  stale: boolean;
  provenance: RawOnboardingProvenance;
  facts: RawOnboardingFacts;
  sections: RawOnboardingSection[] | null;
}

/**
 * AC-47/AC-48: a pure read over `GET /repos/:id/tour` — the ONE GET this
 * handler makes, and the only network call this file allows. There is no
 * POST anywhere in this file, by construction, which is what makes AC-48
 * ("never trigger a generation") true without needing a runtime check.
 */
export function makeGetOnboardingTourHandler(http: DevDigestHttpClient, apiBaseUrl: string) {
  return async (input: GetOnboardingTourInput): Promise<CallToolResult> => {
    try {
      const repo = await resolveRepo(http, input.repo);
      const page = await http.get<RawOnboardingPage>(`/repos/${repo.id}/tour`);
      const result: ConciseOnboardingTour = {
        repo: repo.full_name,
        status: page.status,
        ...(page.reason ? { reason: page.reason } : {}),
        stale: page.stale,
        provenance: page.provenance,
        facts: page.facts,
        sections: page.tour ? page.tour.sections : null,
      };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: mapError(err, apiBaseUrl) }] };
    }
  };
}

function mapError(err: unknown, apiBaseUrl: string): string {
  if (err instanceof Error && (err.name === 'RepoNotFoundError' || err.name === 'AmbiguousRepoError')) {
    return err.message;
  }
  return commonErrorMessage(err, apiBaseUrl);
}
