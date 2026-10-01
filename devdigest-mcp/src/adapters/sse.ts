// Ring 3. Consumes GET /runs/:id/events until the stream closes or the signal
// aborts. fetch + manual body reading (no EventSource). It never cancels the
// run on the server: aborting only drops this client's connection.
import type { RunEndResult } from '../domain/ports.js';

export interface SseEvent {
  kind: string;
  message: string;
}

/** Parses complete SSE frames out of `buffer`; returns the rest. */
export function drainFrames(buffer: string, onFrame: (event: SseEvent) => void): string {
  let rest = buffer.replace(/\r\n/g, '\n');
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let kind = 'message';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) kind = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length === 0) continue;
    let message = data.join('\n');
    try {
      const parsed: unknown = JSON.parse(message);
      if (parsed && typeof parsed === 'object' && 'message' in parsed) {
        const m = (parsed as { message?: unknown }).message;
        if (typeof m === 'string') message = m;
      }
    } catch {
      // keep the raw text
    }
    onFrame({ kind, message });
  }
  return rest;
}

export async function consumeRunEvents(
  url: string,
  signal: AbortSignal,
  onEvent?: (event: SseEvent) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<RunEndResult> {
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'text/event-stream' },
      signal,
    });
    if (!res.ok || !res.body) {
      // Nothing to wait for (unknown run, API restarted): the caller re-reads the run list.
      await res.body?.cancel().catch(() => undefined);
      return { outcome: 'closed' };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = drainFrames(buffer + decoder.decode(value, { stream: true }), (e) => onEvent?.(e));
    }
    return { outcome: 'closed' };
  } catch (err) {
    if (signal.aborted) return { outcome: 'aborted' };
    throw err;
  }
}
