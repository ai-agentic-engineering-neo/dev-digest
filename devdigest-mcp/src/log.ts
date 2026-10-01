// Ring 4. stdout carries ONLY JSON-RPC frames (stdio transport), so every log
// line goes to stderr. Never use console.log or process.stdout in this package.
// Never log request bodies, system prompts or secrets.

type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string): void {
  process.stderr.write(`[devdigest-mcp] ${level}: ${message}\n`);
}

export const log = {
  info: (message: string): void => write('info', message),
  warn: (message: string): void => write('warn', message),
  error: (message: string): void => write('error', message),
};
