import assert from 'node:assert/strict';

import validate from '../utils/validate-config.ts';

describe('validate effective configuration', () => {
  it('validates required normalized keys, arrays and null without rejecting falsy values', () => {
    const schema = {
      type: 'object' as const,
      required: ['some-key'],
      properties: {
        someKey: { type: 'boolean' as const },
        numbers: { type: 'array' as const, items: { type: 'number' as const } },
        optional: { type: 'string' as const, nullable: true },
      },
    };
    validate({ someKey: false, numbers: [0], optional: null, constructor: 'literal' }, schema);
    assert.throws(() => validate({}, schema), /some-key.*required/);
    assert.throws(
      () => validate({ someKey: false, numbers: ['wrong'] }, schema),
      /numbers\[0\].*number/,
    );
    assert.throws(() => validate({ someKey: null }, schema), /boolean/);
  });
});
