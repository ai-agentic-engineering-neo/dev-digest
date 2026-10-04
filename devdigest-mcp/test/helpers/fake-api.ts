// Hermetic fake of the DevDigest API (node:http, 127.0.0.1, ephemeral port).
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeResponse {
  status?: number;
  /** Object => JSON; string => sent verbatim. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Called instead of `body` for streaming responses; end the response yourself. */
  stream?: (res: http.ServerResponse) => void;
}

export interface FakeApi {
  baseUrl: string;
  /** "METHOD /path" of every request received, in order. */
  requests: string[];
  /** Register/replace a route. Key: "METHOD /path". */
  route(key: string, response: FakeResponse): void;
  close(): Promise<void>;
}

export async function startFakeApi(routes: Record<string, FakeResponse> = {}): Promise<FakeApi> {
  const table = new Map(Object.entries(routes));
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const key = `${req.method} ${path}`;
    requests.push(key);
    req.resume();
    const r = table.get(key);
    if (!r) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'not_found', message: 'Route not found' } }));
      return;
    }
    if (r.stream) {
      r.stream(res);
      return;
    }
    const isString = typeof r.body === 'string';
    res.writeHead(r.status ?? 200, {
      'content-type': isString ? 'text/plain' : 'application/json; charset=utf-8',
      ...r.headers,
    });
    res.end(r.body === undefined ? '' : isString ? (r.body as string) : JSON.stringify(r.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    route: (key, response) => void table.set(key, response),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A base URL on which nothing listens (port freed right after binding). */
export async function closedPortUrl(): Promise<string> {
  const api = await startFakeApi();
  const url = api.baseUrl;
  await api.close();
  return url;
}

export function agentFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Security reviewer',
    description: 'desc',
    provider: 'openrouter',
    model: 'cheap/model',
    system_prompt: 'TOP SECRET SYSTEM PROMPT',
    output_schema: null,
    enabled: true,
    version: 3,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...over,
  };
}
