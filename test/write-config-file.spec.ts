import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import write from '../utils/write-config-file.ts';

describe('atomic configuration publication', () => {
  let root: string;
  let file: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-write-'));
    file = path.join(root, 'config.yaml');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('requires explicit creation, preserves modes and rejects stale data and symlinks', () => {
    assert.throws(() => write(file, 'first', null), /requires create/);
    write(file, 'first', null, { create: true });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    fs.chmodSync(file, 0o640);
    write(file, 'second', 'first');
    assert.equal(fs.readFileSync(file, 'utf8'), 'second');
    assert.equal(fs.statSync(file).mode & 0o777, 0o640);
    assert.throws(() => write(file, 'third', 'first'), /changed on disk/);
    const link = path.join(root, 'link.yaml');
    fs.symlinkSync(file, link);
    assert.throws(() => write(link, 'third', 'second'), /no symlinks/);
  });
  it('keeps the old file and cleans temporary data on write, permission and rename failures', () => {
    fs.writeFileSync(file, 'old');
    for (const method of ['writeFileSync', 'renameSync', 'accessSync'] as const) {
      const io = {
        ...fs,
        [method]: () => {
          throw new Error('injected failure');
        },
      };
      assert.throws(() => write(file, 'new', 'old', { io }), /injected failure/);
      assert.equal(fs.readFileSync(file, 'utf8'), 'old');
      assert.deepEqual(fs.readdirSync(root), ['config.yaml']);
    }
  });
  it('preserves a competing creator and detects a change before replacement', () => {
    const io = {
      ...fs,
      linkSync: (from: fs.PathLike, to: fs.PathLike) => {
        fs.writeFileSync(file, 'competitor');
        fs.linkSync(from, to);
      },
    };
    assert.throws(() => write(file, 'new', null, { create: true, io }), /EEXIST/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'competitor');
    assert.deepEqual(fs.readdirSync(root), ['config.yaml']);
    const changed = {
      ...fs,
      fsyncSync: (fd: number) => {
        fs.fsyncSync(fd);
        fs.writeFileSync(file, 'changed');
      },
    };
    assert.throws(() => write(file, 'new', 'competitor', { io: changed }), /changed on disk/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'changed');
    assert.deepEqual(fs.readdirSync(root), ['config.yaml']);
  });
  it('does not report a committed creation as failed when temporary cleanup fails', () => {
    write(file, 'new', null, {
      create: true,
      io: {
        ...fs,
        rmSync: () => {
          throw new Error('cleanup failure');
        },
      },
    });
    assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  });
});
