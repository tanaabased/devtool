import assert from 'node:assert/strict';
import asError from '../utils/as-error.ts';

describe('execution error narrowing', () => {
  it('preserves errors and accepts only supported diagnostic field types', () => {
    const original = Object.assign(new Error('failed'), { code: 7 });
    assert.equal(asError(original), original);
    const value = {
      message: 'failed',
      code: 'ENOENT',
      stderr: 'details',
      statusCode: 404,
      json: { message: 'missing' },
    };
    const error = asError(value);
    assert.equal(error.cause, value);
    assert.equal(error.message, 'failed');
    assert.equal(error.code, 'ENOENT');
    assert.deepEqual(error.json, { message: 'missing' });
    assert.equal(asError({ code: {}, stderr: 7 }).stderr, undefined);
    assert.equal(asError(null).message, 'null');
  });
});
