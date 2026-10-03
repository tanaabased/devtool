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
        sources: [
          {
            id: 'primary',
            kind: 'file',
            file: path.join(root, 'nested', 'preferred.yml'),
            writable: true,
          },
        ],
        writeTarget: 'primary',
      });
      fs.symlinkSync(path.join(root, 'app.yml'), path.join(cwd, 'link.yml'));
      assert.deepEqual(discoverApp({ cwd, file: 'link.yml' }), {
        root,
        file: path.join(root, 'app.yml'),
        sources: [
          { id: 'primary', kind: 'file', file: path.join(root, 'app.yml'), writable: true },
        ],
        writeTarget: 'primary',
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
  it('orders layers at the selected root and never uses layers to discover a root', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-layers-')));
    try {
      fs.mkdirSync(path.join(root, 'nested'));
      for (const file of ['app.yml', 'before.yml', 'after.yml', 'nested/before.yml'])
        fs.writeFileSync(path.join(root, file), '{}');
      const options = {
        cwd: path.join(root, 'nested'),
        filenames: ['app.yml'],
        preFiles: [{ file: 'before.yml' }],
        postFiles: [{ file: 'missing.yml', optional: true }, { file: 'after.yml' }],
      };
      const found = discoverApp(options);
      assert.equal(found.root, root);
      assert.deepEqual(
        found.sources.map(({ file }) => file),
        ['before.yml', 'app.yml', 'missing.yml', 'after.yml'].map((file) => path.join(root, file)),
      );
      assert.deepEqual(
        found.sources.filter(({ writable }) => writable).map(({ id }) => id),
        ['primary'],
      );
      assert.equal(found.sources[2]!.optional, true);
      assert.throws(
        () => discoverApp({ ...options, postFiles: [{ file: 'missing.yml' }] }),
        /post-0.*missing.yml/,
      );
      fs.symlinkSync(path.join(root, 'app.yml'), path.join(root, 'alias.yml'));
      assert.throws(
        () => discoverApp({ ...options, postFiles: [{ file: 'alias.yml' }] }),
        /Duplicate app layer/,
      );
      assert.equal(
        discoverApp({ ...options, file: '../after.yml', postFiles: [] }).file,
        path.join(root, 'after.yml'),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
