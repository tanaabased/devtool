import assert from 'node:assert/strict';
import clone from '../utils/clone-config.ts';
import { ImportString } from '../lib/yaml.ts';

describe('clone config', () => {
  it('isolates mutable config while preserving tagged import metadata', () => {
    const tagged = new ImportString('RUN true', { file: '/fixture/build.sh' });
    const source = { env: { values: ['a'] }, tagged, disabled: false };
    const copy = clone(source);
    copy.env.values.push('b');
    assert.deepEqual(source.env.values, ['a']);
    assert.equal(copy.tagged, tagged);
    assert.deepEqual(copy.tagged.getMetadata(), { file: '/fixture/build.sh' });
    assert.equal(copy.disabled, false);
    assert.equal(clone(null), null);
  });
});
