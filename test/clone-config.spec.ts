import assert from 'node:assert/strict';
import clone from '../utils/clone-config.ts';
import { ImportScalar, ImportString } from '../lib/yaml.ts';

describe('clone config', () => {
  it('isolates mutable config while preserving tagged import metadata', () => {
    const tagged = new ImportString('RUN true', { file: '/fixture/build.sh' });
    const source = {
      env: { values: ['a'] },
      tagged,
      disabled: false,
      zero: new ImportScalar(0, { file: '/fixture/zero.json' }),
    };
    const copy = clone(source);
    copy.env.values.push('b');
    assert.deepEqual(source.env.values, ['a']);
    assert.notEqual(copy.tagged, tagged);
    assert.deepEqual(copy.tagged.getMetadata(), { file: '/fixture/build.sh' });
    assert.equal(copy.disabled, false);
    assert.notEqual(copy.zero, source.zero);
    assert.equal(copy.zero.value, 0);
    assert.deepEqual(copy.zero.getMetadata(), source.zero.getMetadata());
    assert.equal(clone(null), null);
  });
});
