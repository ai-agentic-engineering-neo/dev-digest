import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { CONFIG, clientFor, fakeClock, type Handler } from './helpers.js';

export async function connect(handler: Handler, config = CONFIG) {
  const { api, calls } = clientFor(handler);
  const clock = fakeClock();
  const server = createServer({ api, config, sleep: clock.sleep, now: clock.now });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, server, calls, clock };
}

export function textOf(res: unknown): string {
  const c = (res as { content: { type: string; text: string }[] }).content;
  return c[0]!.text;
}
