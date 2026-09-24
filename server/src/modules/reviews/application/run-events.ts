import type { RunEvent } from '@devdigest/shared';
import type { RunBus } from '../../../platform/sse.js';

/** One finished event, for a run the bus no longer holds. */
export async function* singleEvent(event: RunEvent): AsyncGenerator<RunEvent> {
  yield event;
}

/**
 * Bridge a run's RunBus stream to an async iterator: the retained buffer is
 * replayed first (subscribe does that), then live events, ending when the run
 * completes. Listeners are removed when the consumer stops iterating.
 */
export async function* liveEvents(bus: RunBus, runId: string): AsyncGenerator<RunEvent> {
  const queue: RunEvent[] = [];
  let wake: (() => void) | null = null;
  let done = false;

  const unsubscribe = bus.subscribe(runId, (e) => {
    queue.push(e);
    wake?.();
  });
  const offDone = bus.onDone(runId, () => {
    done = true;
    wake?.();
  });

  try {
    while (true) {
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      if (done) break;
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
  } finally {
    unsubscribe();
    offDone();
  }
}
