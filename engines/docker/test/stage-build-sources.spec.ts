import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stage from '../utils/stage-build-sources.ts';

describe('stage build sources', () => {
  it('clears stale context, copies inputs and gives source-specific failures', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-stage-'));
    try {
      const context = path.join(root, 'context');
      const source = path.join(root, 'input');
      fs.writeFileSync(source, 'input');
      fs.mkdirSync(context);
      fs.writeFileSync(path.join(context, 'stale'), 'old');
      stage(context, [{ source, target: 'file' }]);
      assert.deepEqual(fs.readdirSync(context), ['file']);
      assert.equal(fs.readFileSync(path.join(context, 'file'), 'utf8'), 'input');
      assert.throws(
        () => stage(context, [{ source, target: '../escape' }]),
        /Failed to copy.*escapes/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
