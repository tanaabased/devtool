import assert from 'node:assert/strict';
import render from '../utils/render-config-value.ts';

describe('human configuration values', () => {
  it('keeps ambiguous strings, native scalars and empty containers distinct', () => {
    for (const [value, expected] of [
      [false, 'false'],
      ['false', '"false"'],
      [0, '0'],
      ['0', '"0"'],
      [null, 'null'],
      ['', '""'],
      [[], '[]'],
      [{}, '{}'],
      ['hello', 'hello'],
      ['a=b', 'a=b'],
      ['a\nb', '"a\\nb"'],
    ] as const)
      assert.equal(render(value), expected);
  });
});
