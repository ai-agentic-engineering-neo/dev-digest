import { describe, it, expect } from 'vitest';
import { ReviewService } from '../src/modules/reviews/service.js';
import {
  InvalidRunRequest,
  ReviewNotFound,
  RunAgentNotFound,
  RunTraceNotFound,
} from '../src/modules/reviews/errors.js';
import { PullNotFound } from '../src/modules/_shared/domain/errors.js';
import { DOMAIN_STATUS } from '../src/platform/errors.js';
import type { ReviewAgent } from '../src/modules/reviews/types.js';

const agent = { id: 'a1', name: 'Reviewer', enabled: true } as unknown as ReviewAgent;

function setup() {
  const busCalls: string[] = [];
  const service = new ReviewService({
    repo: {
      deleteReview: async () => false,
      getRunTrace: async () => undefined,
      getPull: async () => undefined,
      cancelRunIfRunning: async () => true,
    } as never,
    agents: {
      listEnabled: async () => [agent],
      getById: async (_ws, id) => (id === 'a1' ? agent : undefined),
    },
    runBus: {
      publish: (id: string) => void busCalls.push(`publish:${id}`),
      cancel: (id: string) => void busCalls.push(`cancel:${id}`),
      complete: (id: string) => void busCalls.push(`complete:${id}`),
    } as never,
    llmFor: () => Promise.reject(new Error('unused')),
    repoIntel: {} as never,
    git: {} as never,
  });
  return { service, busCalls };
}

describe('ReviewService', () => {
  it('resolveTargets: all → enabled agents; unknown agent / empty request → domain errors', async () => {
    const { service } = setup();
    expect(await service.resolveTargets('w1', { all: true })).toEqual([agent]);
    expect(await service.resolveTargets('w1', { agentId: 'a1' })).toEqual([agent]);
    await expect(service.resolveTargets('w1', { agentId: 'zz' })).rejects.toBeInstanceOf(RunAgentNotFound);
    await expect(service.resolveTargets('w1', {})).rejects.toBeInstanceOf(InvalidRunRequest);
  });

  it('missing review / trace / pull raise domain errors that keep their HTTP statuses', async () => {
    const { service } = setup();
    await expect(service.deleteReview('w1', 'r1')).rejects.toBeInstanceOf(ReviewNotFound);
    await expect(service.getRunTrace('run1')).rejects.toBeInstanceOf(RunTraceNotFound);
    await expect(service.runReview('w1', 'p1', [agent])).rejects.toBeInstanceOf(PullNotFound);
    expect([DOMAIN_STATUS.review_not_found, DOMAIN_STATUS.run_trace_not_found, DOMAIN_STATUS.pull_not_found]).toEqual([
      404, 404, 404,
    ]);
    expect([DOMAIN_STATUS.invalid_run_request, DOMAIN_STATUS.agent_not_found]).toEqual([400, 404]);
  });

  it('cancelRun signals the live run, marks the row and completes the stream', async () => {
    const { service, busCalls } = setup();
    await service.cancelRun('run1');
    expect(busCalls).toEqual(['publish:run1', 'cancel:run1', 'complete:run1']);
  });
});
