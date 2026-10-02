import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import remove from '../utils/remove.ts';

describe('utils/remove', () => {
  it('should remove trees repeatedly without following a symlink into another tree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-remove-'));
    try {
      const target = path.join(root, 'target');
      const outside = path.join(root, 'outside');
      fs.mkdirSync(target);
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'keep'), 'keep');
      fs.symlinkSync(outside, path.join(target, 'link'));
      fs.writeFileSync(path.join(target, 'file'), 'remove');
      remove(target);
      remove(target);
      assert.equal(fs.existsSync(target), false);
      assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'keep');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
