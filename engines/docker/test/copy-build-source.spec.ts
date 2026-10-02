import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import copyBuildSource from '../utils/copy-build-source.ts';

describe('engines/docker/utils/copy-build-source', () => {
  it('excludes generated storage and rejects escaping destination paths', () => {
    const copy = copyBuildSource;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-copy-'));
    try {
      const source = path.join(root, 'app');
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'input'), 'data');
      const generated = path.join(source, 'generated');
      fs.mkdirSync(generated);
      const context = path.join(generated, 'context');
      copy({ source, target: '.' }, context, [generated]);
      assert.equal(fs.readFileSync(path.join(context, 'input'), 'utf8'), 'data');
      assert.equal(fs.existsSync(path.join(context, 'generated')), false);
      assert.throws(() => copy({ source, target: '../outside' }, context, [generated]), /escapes/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
