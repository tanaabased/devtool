import assert from 'node:assert/strict';
import isStringy from '../utils/is-stringy.ts';
import { ImportString } from '../lib/yaml.ts';

describe('utils/is-stringy', () => {
  it('should accept plain and tagged YAML strings without accepting unrelated objects', () => {
    assert.equal(isStringy(''), true);
    assert.equal(isStringy('FROM alpine'), true);
    assert.equal(isStringy(new ImportString('FROM alpine', { file: '/fixture/Dockerfile' })), true);
    for (const value of [null, undefined, 0, false, {}, [], new String('text')])
      assert.equal(isStringy(value), false);
  });
});
