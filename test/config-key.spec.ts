import assert from 'node:assert/strict';
import configKey from '../utils/config-key.ts';

describe('configuration CLI keys', () => {
  const schema = { properties: { knownField: { values: { properties: { nestedKey: {} } } } } };
  it('translates declared segments while retaining literal dictionary names', () => {
    const result = configKey('known-field.MY_KEY.nested-key', schema);
    assert.deepEqual(result.internal, ['knownField', 'MY_KEY', 'nestedKey']);
    assert.deepEqual(result.external, ['known-field', 'MY_KEY', 'nested-key']);
    assert.deepEqual(configKey(['knownField', 'literal.key'], schema).internal, [
      'knownField',
      'literal.key',
    ]);
    assert.deepEqual(configKey('unknownField', schema).external, ['unknownField']);
  });
  it('rejects empty paths and segments', () => {
    for (const key of ['', '.', 'some..key']) assert.throws(() => configKey(key, schema));
  });
});
