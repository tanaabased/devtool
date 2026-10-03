import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import discoverApp from '../utils/discover-app.ts';

describe('CLI app discovery', () => {
  let root: string;
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-discover-')));
    fs.mkdirSync(path.join(root, 'nested', 'child'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('discovers the nearest primary, preferring yaml within the same root', () => {
    for (const file of ['.devtool.yaml', 'nested/.devtool.yml'])
      fs.writeFileSync(path.join(root, file), '{}');
    const cwd = path.join(root, 'nested', 'child');
    assert.equal(discoverApp({ cwd }).file, path.join(root, 'nested', '.devtool.yml'));
    fs.writeFileSync(path.join(root, 'nested', '.devtool.yaml'), '{}');
    const found = discoverApp({ cwd });
    assert.equal(found.file, path.join(root, 'nested', '.devtool.yaml'));
    assert.equal(found.root, path.join(root, 'nested'));
    assert.deepEqual(found.sources, [
      { id: 'primary', kind: 'file', file: found.file, writable: true },
    ]);
    assert.equal(found.writeTarget, 'primary');
    assert.deepEqual(found.policy, { appFile: '.devtool', appFiles: [{ file: '.devtool' }] });
    assert.equal(Reflect.set(found.policy.appFiles[0]!, 'file', 'changed'), false);
    assert.equal(Reflect.set(found.policy.appFiles, '0', { file: 'changed' }), false);
  });

  it('uses CLI-owned names and canonical roots, with no arbitrary file override', () => {
    fs.writeFileSync(path.join(root, 'application.yml'), '{}');
    const cwd = path.join(root, 'nested');
    fs.symlinkSync(path.join(root, 'application.yml'), path.join(cwd, 'custom.yaml'));
    assert.equal(discoverApp({ cwd, appFile: 'custom' }).root, root);
    assert.equal(
      discoverApp({ cwd, appFile: 'application' }).file,
      path.join(root, 'application.yml'),
    );
    assert.throws(() => discoverApp({ cwd, appFile: 'absent-unique' }), /No app file/);
    for (const appFile of ['', '.', '..', '../application', 'application.yaml'])
      assert.throws(() => discoverApp({ cwd, appFile }), /filename stem/);
  });

  it('resolves the full order at the primary root and skips only explicitly optional layers', () => {
    for (const file of [
      'application.yaml',
      'before.yml',
      'after.yaml',
      'after.yml',
      'nested/before.yaml',
    ])
      fs.writeFileSync(path.join(root, file), '{}');
    const options = {
      cwd: path.join(root, 'nested'),
      appFile: 'application',
      appFiles: ['before', '.', { file: 'missing', optional: true }, 'after'],
    };
    const found = discoverApp(options);
    assert.equal(found.root, root);
    assert.deepEqual(
      found.sources.map(({ file }) => file),
      ['before.yml', 'application.yaml', 'missing.yaml', 'after.yaml'].map((file) =>
        path.join(root, file),
      ),
    );
    assert.deepEqual(
      found.sources.filter(({ writable }) => writable).map(({ id }) => id),
      ['primary'],
    );
    assert.equal(found.sources[2]!.optional, true);
    assert.throws(
      () => discoverApp({ ...options, appFiles: ['.', 'missing'] }),
      /Missing app layer/,
    );
    for (const appFiles of [[], ['before'], ['.', 'application'], [{ file: '.', optional: true }]])
      assert.throws(() => discoverApp({ ...options, appFiles }), /required primary exactly once/);
    fs.symlinkSync(path.join(root, 'application.yaml'), path.join(root, 'alias.yaml'));
    assert.throws(
      () => discoverApp({ ...options, appFiles: ['.', 'alias'] }),
      /Duplicate app layer/,
    );
    fs.mkdirSync(path.join(root, 'missing.yaml'));
    assert.throws(() => discoverApp(options), /not a file/);
  });

  it('does not fall back from an invalid preferred file or ignore a dangling optional layer', () => {
    fs.writeFileSync(path.join(root, '.devtool.yml'), '{}');
    fs.mkdirSync(path.join(root, '.devtool.yaml'));
    assert.throws(() => discoverApp({ cwd: root }), /not a file/);
    fs.rmdirSync(path.join(root, '.devtool.yaml'));
    fs.symlinkSync(path.join(root, 'absent'), path.join(root, 'optional.yaml'));
    assert.throws(
      () => discoverApp({ cwd: root, appFiles: ['.', { file: 'optional', optional: true }] }),
      /ENOENT/,
    );
  });
});
