import assert from 'node:assert/strict';
import parse from '../utils/parse-file-type.ts';

describe('parse file type', () => {
  it('uses extensions and explicit tags, preserving filenames with spaces', () => {
    assert.deepEqual(parse(' config file.yaml '), { file: 'config file.yaml', type: 'yaml' });
    assert.deepEqual(parse('payload.json@string'), { file: 'payload.json', type: 'string' });
    assert.deepEqual(parse('payload@.binary'), { file: 'payload', type: 'binary' });
    assert.deepEqual(parse(''), { file: '', type: '' });
  });
});
