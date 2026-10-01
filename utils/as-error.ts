/** Keep errors and their numeric exit codes intact while narrowing unknown throws. */
export interface ExecutionError extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
  short?: string;
  context?: unknown;
  logfile?: string;
  id?: string;
  details?: unknown;
  all?: string;
  args?: unknown;
  command?: unknown;
  errorCode?: number | string;
  statusCode?: number;
  exitCode?: number | string;
  originalMessage?: string;
  json?: { message?: string };
  reason?: string;
  body?: { error?: string };
}
export default function asError(value: unknown): ExecutionError {
  if (value instanceof Error) return value;
  const error: ExecutionError = new Error(String(value), { cause: value });
  if (value && typeof value === 'object') {
    const fields = value as Record<string, unknown>;
    for (const key of ['message', 'stdout', 'stderr', 'short', 'reason'] as const) {
      if (typeof fields[key] === 'string') error[key] = fields[key];
    }
    if (typeof fields.code === 'number' || typeof fields.code === 'string')
      error.code = fields.code;
    if (typeof fields.statusCode === 'number') error.statusCode = fields.statusCode;
    for (const [key, nested] of [
      ['json', 'message'],
      ['body', 'error'],
    ] as const) {
      const field = fields[key];
      if (
        field &&
        typeof field === 'object' &&
        nested in field &&
        typeof Reflect.get(field, nested) === 'string'
      ) {
        Object.assign(error, { [key]: { [nested]: Reflect.get(field, nested) } });
      }
    }
  }
  return error;
}
