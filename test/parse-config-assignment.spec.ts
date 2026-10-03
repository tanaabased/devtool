import assert from 'node:assert/strict';
import parse from '../utils/parse-config-assignment.ts';

describe('config assignments', () => {
  it('preserves types, explicit strings, empties and embedded equals signs', () => {
    for (const [raw, value] of [
      ['false', false],
      ['0', 0],
      ['null', null],
      ['', ''],
      ['[]', []],
      ['{}', {}],
      ['[false,0,null,""]', [false, 0, null, '']],
      ['"false"', 'false'],
      ['"001"', '001'],
      ['a=b=c', 'a=b=c'],
      [' hello ', ' hello '],
      ['1e2', 100],
    ])
      assert.deepEqual(parse(`some-key=${raw}`), { op: 'set', path: 'some-key', value });
  });
  it('rejects invalid paths, malformed structured data and non-finite numbers', () => {
    for (const input of [
      'no-equals',
      '=value',
      'a..b=1',
      'a=[bad]',
      'a={',
      'a="bad',
      'a=1e999',
      'a=[1e999]',
    ])
      assert.throws(() => parse(input));
  });
});
