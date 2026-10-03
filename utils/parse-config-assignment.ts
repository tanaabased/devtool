import type { ConfigEdit } from '../components/config.ts';

/** JSON literals are typed; other text is a string. A quoted JSON string forces string intent. */
export default function parseConfigAssignment(assignment: string): ConfigEdit & { op: 'set' } {
  const equals = assignment.indexOf('=');
  if (equals < 1) throw new Error('Expected key=value');
  const path = assignment.slice(0, equals);
  if (path.split('.').some((part) => !part)) throw new Error('Configuration key must be nonempty');
  const raw = assignment.slice(equals + 1);
  const trimmed = raw.trim();
  let value: unknown = raw;
  if (
    /^(?:true|false|null)$/.test(trimmed) ||
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed) ||
    /^[[{"]/.test(trimmed)
  ) {
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new Error(`${path}: invalid JSON value; quote an intentional string as JSON`);
    }
    const finite = (item: unknown): boolean =>
      typeof item === 'number'
        ? Number.isFinite(item)
        : item !== null && typeof item === 'object'
          ? Object.values(item).every(finite)
          : true;
    if (!finite(value)) throw new Error(`${path}: numbers must be finite`);
  }
  return { op: 'set', path, value };
}
