/**
 * Minimal SSE frame reader over a `fetch()` `ReadableStream<Uint8Array>`.
 * Mirrors the shape `server/src/modules/reviews/routes.ts`'s `GET
 * /runs/:id/events` emits: one frame per `RunEvent`, `id`/`event`/`data`
 * lines, frames separated by a blank line (`\n\n`), `data:` holding
 * `JSON.stringify(RunEvent)`.
 */

/** Mirrors `@devdigest/shared`'s `RunEvent` contract
 *  (`server/src/vendor/shared/contracts/trace.ts`) — redefined locally per
 *  this package's "no shared-contract import" decision (specs/06-mcp-server.md). */
export interface RunEvent {
  runId: string;
  seq: number;
  kind: string;
  msg: string;
  t: string;
  data?: unknown;
}

/**
 * Reads `stream`, splitting on blank-line frame boundaries and yielding one
 * `RunEvent` per `data:` line that parses as JSON matching the RunEvent
 * shape. Tolerates a frame split across two chunk boundaries by buffering
 * partial input across `reader.read()` calls. Malformed/non-RunEvent frames
 * are silently skipped rather than throwing — a single bad frame must not
 * kill the whole wait loop.
 */
export async function* readRunEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<RunEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let sepIndex = buffer.indexOf('\n\n');
      while (sepIndex !== -1) {
        const rawFrame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const event = parseRunEventFrame(rawFrame);
        if (event) yield event;
        sepIndex = buffer.indexOf('\n\n');
      }
      if (done) break;
    }
    // Flush a trailing frame with no final blank line (rare, but the
    // stream can end mid-frame if the server closes right after writing).
    const trailing = parseRunEventFrame(buffer);
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}

function parseRunEventFrame(raw: string): RunEvent | null {
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (dataLines.length === 0) return null;
  return parseRunEventJson(dataLines.join('\n'));
}

function parseRunEventJson(data: string): RunEvent | null {
  if (data.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return isRunEventLike(parsed) ? parsed : null;
}

function isRunEventLike(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.runId === 'string' &&
    typeof v.seq === 'number' &&
    typeof v.kind === 'string' &&
    typeof v.msg === 'string' &&
    typeof v.t === 'string'
  );
}
