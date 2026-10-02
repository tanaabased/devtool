import assert from 'node:assert/strict';
import success from '../utils/make-success.ts';

describe('engines/docker/utils/make-success', () => {
  it('should preserve separate and combined diagnostics on a successful command', () => {
    const input = {
      command: 'build',
      args: ['a b'],
      stdout: 'output',
      stderr: 'warning',
      all: 'output\nwarning',
    };
    const result = success(input);
    assert.deepEqual(result, { ...input, exitCode: 0 });
    assert.equal(Object.hasOwn(input, 'exitCode'), false);
  });
});
