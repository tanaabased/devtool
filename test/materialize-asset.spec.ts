import requireValue from '../utils/require-value.ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import materialize from '../utils/materialize-asset.ts';
import { fixture } from '../utils/create-test-project.ts';
import shellAsset, { shellAssets } from '../services/lando/lib/shell-assets.ts';

describe('shell assets', () => {
  it('registers every runtime shell file with executable mode and leaves library paths ordinary', () => {
    const root = path.resolve(import.meta.dirname, '../services/lando');
    assert.deepEqual(
      Object.keys(shellAssets).sort(),
      [...new Bun.Glob('{packages,scripts}/**/*.sh').scanSync(root)].sort(),
    );
    for (const id of Object.keys(shellAssets) as (keyof typeof shellAssets)[]) {
      assert.equal(shellAsset(id, '/unused'), path.join(root, id));
      assert.equal(fs.statSync(path.join(root, id)).mode & 0o777, 0o755, id);
    }
  });
  it('restores bytes and modes without rewriting correct files or following destination symlinks', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-assets-'));
    try {
      const source = path.join(root, 'source');
      const target = path.join(root, 'nested', 'boot.sh');
      fs.writeFileSync(source, Buffer.from([0, 13, 10, 255]));
      materialize(source, target);
      assert.deepEqual(fs.readFileSync(target), fs.readFileSync(source));
      assert.equal(fs.statSync(target).mode & 0o777, 0o755);
      const stat = fs.statSync(target);
      materialize(source, target);
      assert.equal(fs.statSync(target).ino, stat.ino);
      fs.writeFileSync(target, 'corrupt');
      fs.chmodSync(target, 0o644);
      materialize(source, target);
      assert.deepEqual(fs.readFileSync(target), fs.readFileSync(source));
      assert.equal(fs.statSync(target).mode & 0o777, 0o755);
      fs.unlinkSync(target);
      fs.symlinkSync(source, target);
      materialize(source, target);
      assert.equal(fs.lstatSync(target).isSymbolicLink(), false);
      assert.equal(fs.statSync(source).mode & 0o777, 0o644);
      assert.deepEqual(fs.readdirSync(path.dirname(target)), ['boot.sh']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('publishes complete executable files when callers materialize concurrently', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-assets-race-'));
    try {
      const source = path.join(root, 'source');
      const target = path.join(root, 'assets', 'boot.sh');
      fs.writeFileSync(source, Buffer.alloc(65536, 42));
      const helper = path.resolve(import.meta.dirname, '../utils/materialize-asset.ts');
      await Promise.all(
        Array.from(
          { length: 4 },
          () =>
            new Promise<void>((resolve, reject) => {
              const child = spawn(
                process.execPath,
                [
                  '-e',
                  'const {default: write} = await import(process.argv[1]); write(process.argv[2], process.argv[3]);',
                  helper,
                  source,
                  target,
                ],
                { stdio: 'pipe' },
              );
              let error = '';
              child.stderr.on('data', (chunk) => {
                error += chunk;
              });
              child.on('error', reject);
              child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(error))));
            }),
        ),
      );
      assert.deepEqual(fs.readFileSync(target), fs.readFileSync(source));
      assert.equal(fs.statSync(target).mode & 0o777, 0o755);
      assert.deepEqual(fs.readdirSync(path.dirname(target)), ['boot.sh']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('keeps boot assets off exec and info paths', async () => {
    const f = fixture({ web: { type: 'lando', image: 'alpine', certs: false } });
    try {
      const app = f.load();
      await app.exec('web', ['echo', 'hello']);
      assert.equal(
        requireValue(app.services[0])
          .generateBuildContext()
          .sources.some((source) => source.source.endsWith('boot.sh')),
        false,
      );
      await app.start();
      assert.equal(
        requireValue(app.services[0])
          .generateBuildContext()
          .sources.some((source) => source.source.endsWith('boot.sh')),
        true,
      );
    } finally {
      f.cleanup();
    }
  });
});
