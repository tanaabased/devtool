import assert from 'node:assert/strict';

import merge, { type Provenance } from '../utils/merge-config.ts';

describe('merge configuration sources', () => {
  it('replaces subtrees without stale descendant provenance or prototype mutation', () => {
    const provenance: Provenance = new Map();
    const first = { nested: { old: true }, list: [1, 2], zero: 0, disabled: false };
    const original = merge({}, first, { source: 'first', revision: 0 }, provenance);
    const next = merge(
      original,
      JSON.parse('{"nested":null,"list":[3],"__proto__":{"polluted":true}}'),
      { source: 'next', revision: 0 },
      provenance,
    );
    assert.equal(provenance.has('["nested","old"]'), false);
    assert.equal(provenance.has('["list","1"]'), false);
    assert.equal(Object.getPrototypeOf(next), Object.prototype);
    assert.equal(Object.hasOwn(next, '__proto__'), true);
    assert.deepEqual(next.list, [3]);
    assert.equal(next.zero, 0);
    assert.equal(next.disabled, false);
    assert.deepEqual(first, original);
  });
});
