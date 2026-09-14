import { describe, expect, it } from 'vitest';
import { readRunEvents } from '../../src/http/sse.js';

/** Builds a ReadableStream that emits `chunks` (already-encoded strings) as
 *  separate `enqueue()` calls, simulating real chunk-boundary splits. */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const event of readRunEvents(stream)) out.push(event);
  return out;
}

describe('readRunEvents', () => {
  it('parses a single frame', async () => {
    const frame = `id: 1\nevent: info\ndata: ${JSON.stringify({ runId: 'r1', seq: 1, kind: 'info', msg: 'starting', t: '00.00' })}\n\n`;
    const events = await collect(streamFromChunks([frame]));
    expect(events).toEqual([{ runId: 'r1', seq: 1, kind: 'info', msg: 'starting', t: '00.00' }]);
  });

  it('parses multiple frames in one chunk', async () => {
    const e1 = { runId: 'r1', seq: 1, kind: 'info', msg: 'a', t: '00.01' };
    const e2 = { runId: 'r1', seq: 2, kind: 'result', msg: 'b', t: '00.02' };
    const chunk = `event: info\ndata: ${JSON.stringify(e1)}\n\nevent: result\ndata: ${JSON.stringify(e2)}\n\n`;
    const events = await collect(streamFromChunks([chunk]));
    expect(events).toEqual([e1, e2]);
  });

  it('reassembles a frame split across two chunk boundaries', async () => {
    const event = { runId: 'r1', seq: 3, kind: 'tool', msg: 'running astgrep', t: '00.05' };
    const full = `event: tool\ndata: ${JSON.stringify(event)}\n\n`;
    const splitAt = Math.floor(full.length / 2);
    const chunkA = full.slice(0, splitAt);
    const chunkB = full.slice(splitAt);
    const events = await collect(streamFromChunks([chunkA, chunkB]));
    expect(events).toEqual([event]);
  });

  it('skips a frame whose data is not valid JSON', async () => {
    const good = { runId: 'r1', seq: 1, kind: 'info', msg: 'ok', t: '00.00' };
    const chunk = `data: not json at all\n\ndata: ${JSON.stringify(good)}\n\n`;
    const events = await collect(streamFromChunks([chunk]));
    expect(events).toEqual([good]);
  });

  it('skips a frame whose JSON does not look like a RunEvent', async () => {
    const good = { runId: 'r1', seq: 1, kind: 'info', msg: 'ok', t: '00.00' };
    const chunk = `data: ${JSON.stringify({ unrelated: true })}\n\ndata: ${JSON.stringify(good)}\n\n`;
    const events = await collect(streamFromChunks([chunk]));
    expect(events).toEqual([good]);
  });

  it('yields nothing for an empty stream', async () => {
    const events = await collect(streamFromChunks([]));
    expect(events).toEqual([]);
  });
});
