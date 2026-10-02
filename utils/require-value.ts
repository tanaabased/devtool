import assert from 'node:assert/strict';

/** Assert a fixture's required entry exists before examining its behavior. */
export default function requireValue<T>(value: T | null | undefined): T {
  assert.ok(value !== undefined && value !== null, 'Expected fixture entry to exist');
  return value;
}
