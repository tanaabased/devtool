import assert from 'node:assert/strict';
import path from 'node:path';

import { ImportObject } from '../lib/yaml.ts';
import normalize from '../utils/normalize-config.ts';

describe('normalize configuration keys', () => {
  it('accepts either schema spelling, preserving literal dictionaries and source-relative paths', () => {
    const schema = {
      properties: { 'some-key': { properties: { filePath: { path: true } } }, labels: {} },
    };
    const input = {
      someKey: new ImportObject({ 'file-path': './child' }, { file: '/source/nested/input.yml' }),
      labels: { My_Label: 0 },
    };
    const result = normalize(input, schema, { base: '/root' }) as {
      someKey: { filePath: string };
      labels: object;
    };
    assert.equal(result.someKey.filePath, path.resolve('/source/nested/child'));
    assert.deepEqual(result.labels, input.labels);
    assert.deepEqual(normalize(result, schema, { external: true }), {
      'some-key': { 'file-path': path.resolve('/source/nested/child') },
      labels: { My_Label: 0 },
    });
    assert.throws(
      () => normalize({}, { properties: { someKey: {}, 'some-key': {} } }),
      /ambiguous schema/,
    );
    assert.throws(() => normalize({ item: new Date() }), /plain configuration object/);
  });
});
