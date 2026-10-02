import assert from 'node:assert/strict';
import requireValue from '../utils/require-value.ts';

describe('utils/require-value', () => {
  it('should reject absent entries while preserving valid falsy values and object identity', () => {
    assert.throws(() => requireValue(null), assert.AssertionError);
    assert.throws(() => requireValue(undefined), assert.AssertionError);
    for (const value of [0, false, '', {}]) assert.equal(requireValue(value), value);
  });
});
