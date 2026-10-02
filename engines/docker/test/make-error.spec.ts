import assert from 'node:assert/strict';
import type { ExecutionError } from '../../../utils/as-error.ts';
import makeError from '../utils/make-error.ts';

describe('build error normalization', () => {
  it('preserves the original error and combines diagnostics without dropping its code', () => {
    const source: ExecutionError = Object.assign(new Error('original'), { code: 17 });
    const error = makeError({
      error: source,
      stdout: 'out',
      stderr: 'err',
      command: 'docker',
      args: ['build'],
    });
    assert.equal(error, source);
    assert.equal(error.originalMessage, 'original');
    assert.equal(error.message, 'out\nerr');
    assert.equal(error.code, 17);
    assert.deepEqual(error.args, ['build']);
    assert.equal(
      makeError({ error: { json: { message: 'daemon failure' } } }).short,
      'daemon failure',
    );
  });
});
