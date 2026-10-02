import assert from 'node:assert/strict';
import getBuildxError from '../utils/get-buildx-error.ts';

describe('engines/docker/utils/get-buildx-error', () => {
  it('preserves useful diagnostics when buildx reports a failure without step output', () => {
    const parse = getBuildxError;
    assert.match(
      parse({ stderr: '#1 ERROR: missing COPY source\n' }).message,
      /missing COPY source/,
    );
    assert.match(parse({ stderr: '\nfailed to solve: missing file' }).message, /missing file/);
  });
});
