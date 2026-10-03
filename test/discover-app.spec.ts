import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import discoverApp from '../utils/discover-app.ts';

describe('CLI app discovery', () => {
  it('uses nearest ancestors, ordered names, explicit files and canonical roots', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-discover-')));
    try {
      fs.mkdirSync(path.join(root, 'nested', 'child'), { recursive: true });
      fs.writeFileSync(path.join(root, 'app.yml'), '');
      fs.writeFileSync(path.join(root, 'nested', 'app.yml'), '');
      fs.writeFileSync(path.join(root, 'nested', 'preferred.yml'), '');
      const cwd = path.join(root, 'nested', 'child');
      assert.deepEqual(discoverApp({ cwd, filenames: ['preferred.yml', 'app.yml'] }), {
        root: path.join(root, 'nested'),
        file: path.join(root, 'nested', 'preferred.yml'),
      });
      fs.symlinkSync(path.join(root, 'app.yml'), path.join(cwd, 'link.yml'));
      assert.deepEqual(discoverApp({ cwd, file: 'link.yml' }), {
        root,
        file: path.join(root, 'app.yml'),
      });
      assert.throws(
        () => discoverApp({ cwd: root, filenames: ['absent-unique.yml'] }),
        /No app file/,
      );
      assert.throws(() => discoverApp({ cwd, filenames: ['../app.yml'] }), /filenames/);
      assert.throws(() => discoverApp({ cwd, file: '.' }), /not a file/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
