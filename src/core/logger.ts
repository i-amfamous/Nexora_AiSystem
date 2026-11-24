/**
 * Minimal structured logger: JSON in production, compact text otherwise.
 * Sensitive keys are redacted recursively, and logging never throws.
 */

type Level = 'info' | 'warn' | 'error' | 'debug';
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /password|secret|token|authorization|cookie|credential/i;
const REDACTED = '[REDACTED]';
const production = process.env.NODE_ENV === 'production';

function sanitize(value: unknown, ancestors: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => sanitize(item, ancestors));

    const clean: Fields = {};
    for (const [key, item] of Object.entries(value)) {
      clean[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, ancestors);
    }
    return clean;
  } finally {
    ancestors.delete(value);
  }
}

function emit(level: Level, message: string, fields?: Fields): void {
  try {
    const clean = (fields ? sanitize(fields) : {}) as Fields;
    const timestamp = new Date().toISOString();
    const output = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

    if (production) {
      output.write(`${JSON.stringify({ timestamp, level, message, ...clean })}\n`);
      return;
    }

    const details = Object.entries(clean)
      .map(([key, value]) => `${key}=${JSON.stringify(value) ?? String(value)}`)
      .join(' ');
    output.write(`[${timestamp}] ${level.toUpperCase()} ${message}${details ? ` ${details}` : ''}\n`);
  } catch {
    // Logging must never break the caller.
  }
}

export const logger = {
  info: (message: string, fields?: Fields): void => emit('info', message, fields),
  warn: (message: string, fields?: Fields): void => emit('warn', message, fields),
  error: (message: string, fields?: Fields): void => emit('error', message, fields),
  debug: (message: string, fields?: Fields): void => emit('debug', message, fields),
};
