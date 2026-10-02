import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import find from '../utils/find-file.ts';

describe('upward file lookup', () => {
  it('selects the nearest ancestor and returns no result for missing inputs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-find-'));
    try {
      const child = path.join(root, 'child');
      fs.mkdirSync(child);
      fs.writeFileSync(path.join(root, 'config'), 'parent');
      assert.equal(find('config', child), path.join(root, 'config'));
      fs.writeFileSync(path.join(child, 'config'), 'child');
      assert.equal(find('config', child), path.join(child, 'config'));
      assert.equal(find('devtool-missing-fixture', child), undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
