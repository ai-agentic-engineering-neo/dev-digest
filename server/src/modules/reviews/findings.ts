import type { Container } from '../../platform/container.js';
import type { FindingActionKind } from '@devdigest/shared';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { MemoryService } from '../memory/service.js';
import type { ReviewRepository } from './repository.js';
import { SPEC_CHUNK_LIMIT } from './constants.js';
import { findingMemoryContent, findingRowToDto, type ReviewDtoFinding } from './helpers.js';

export async function actOnFinding(
  repo: ReviewRepository,
  memory: MemoryService,
  workspaceId: string,
  findingId: string,
  action: FindingActionKind,
  reply?: string,
): Promise<{ finding: ReviewDtoFinding; memoryId?: string }> {
  const ctx = await repo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) {
    throw new NotFoundError('Finding not found');
  }
  const { finding, pull } = ctx;

  switch (action) {
    case 'accept': {
      const row = await repo.setFindingAccepted(findingId, new Date());
      return { finding: findingRowToDto(row!) };
    }
    case 'dismiss': {
      const row = await repo.setFindingDismissed(findingId, new Date());
      return { finding: findingRowToDto(row!) };
    }
    case 'learn': {
      // Create a kind='learning' memory row via A1's MemoryService (§7 AC).
      const content = findingMemoryContent(finding, reply);
      const mem = await memory.learnFromFinding(workspaceId, {
        content,
        repoId: pull.repoId,
        prNumber: pull.number,
        context: `Learned from finding "${finding.title}" on PR #${pull.number}`,
      });
      // Learning also implies accepting the finding's signal.
      const row = await repo.setFindingAccepted(findingId, new Date());
      return { finding: findingRowToDto(row!), memoryId: mem.id };
    }
    case 'reply': {
      if (!reply) throw new AppError('reply_required', 'reply text is required', 400);
      // Store the reply as a memory note scoped to the repo (provenance: the PR).
      const mem = await memory.create(workspaceId, {
        content: `Reply on finding "${finding.title}" (PR #${pull.number}): ${reply}`,
        scope: 'repo',
        kind: 'preference',
        confidence: 0.6,
        sources: [{ pr: pull.number, context: 'Reviewer reply to a finding' }],
        repoId: pull.repoId,
      });
      return { finding: findingRowToDto(finding), memoryId: mem.id };
    }
    default:
      throw new AppError('invalid_action', `Unknown action '${action}'`, 400);
  }
}

export async function collectSkills(
  agents: Container['agentsRepo'],
  agentId: string,
): Promise<string[]> {
  const links = await agents.linkedSkills(agentId);
  return links
    .filter((l) => l.skill.enabled)
    .map((l) => `### ${l.skill.name}\n${l.skill.body}`);
}

/** Pull project-context spec chunks for the repo (source='spec'); capped. */
export async function collectSpecs(
  container: Container,
  _workspaceId: string,
  repoId: string,
): Promise<string[]> {
  try {
    const rows = await container.db
      .select({ content: schema.codeChunks.content })
      .from(schema.codeChunks)
      .where(and(eq(schema.codeChunks.repoId, repoId), eq(schema.codeChunks.source, 'spec')))
      .limit(SPEC_CHUNK_LIMIT);
    return rows.map((r) => r.content);
  } catch {
    return [];
  }
}
