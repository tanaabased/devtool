import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matches from '../utils/get-mount-matches.ts';

describe('app root mount matches', () => {
  it('returns only existing app-root short-form bind destinations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-mount-'));
    try {
      assert.deepEqual(
        matches(root, [
          '.:/app:ro',
          `${root}:/code`,
          'missing:/missing',
          'named',
          { source: root, target: '/object' },
        ]),
        ['/app', '/code'],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
