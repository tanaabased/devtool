import assert from 'node:assert/strict';
import disabled from '../utils/is-disabled.ts';

describe('utils/is-disabled', () => {
  it('should recognize disabled settings without treating every falsy-looking value as disabled', () => {
    for (const value of [false, 0, null, undefined, '0', 'false', 'OFF', 'Disable', 'disabled'])
      assert.equal(disabled(value), true, String(value));
    for (const value of [true, 1, '', 'no', ' false ', [], {}, 'enabled'])
      assert.equal(disabled(value), false, String(value));
  });
});
