import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import write from '../utils/write-file.ts';
// Ported from Core test/write-file.spec.js at 7a87f805 using native assertions.

describe('write-file upstream regressions', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-write-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  it('writes strings and creates missing parent directories', () => {
    for (const name of ['test.crt', 'certs/deeper/test.crt']) {
      const file = path.join(directory, name);
      write(file, 'CERTIFICATE DATA');
      assert.equal(fs.readFileSync(file, 'utf8'), 'CERTIFICATE DATA');
    }
  });
  it('rewrites existing files without replacing their inode', () => {
    const file = path.join(directory, 'test.crt');
    write(file, 'ORIGINAL');
    const inode = fs.statSync(file).ino;
    write(file, 'REWRITTEN');
    assert.equal(fs.readFileSync(file, 'utf8'), 'REWRITTEN');
    assert.equal(fs.statSync(file).ino, inode);
  });
  it('recovers when Docker created a directory at a string, JSON or YAML target', () => {
    for (const ext of ['crt', 'json', 'yaml']) {
      const file = path.join(directory, `test.${ext}`);
      fs.mkdirSync(path.join(file, 'rogue'), { recursive: true });
      write(file, ext === 'crt' ? 'DATA' : { lando: true });
      assert.ok(fs.statSync(file).isFile());
    }
  });
});
