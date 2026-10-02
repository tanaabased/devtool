import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import exists from '../utils/exists-sync.ts';

describe('exists-sync', () => {
  let directory: string;
  before(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-exists-'));
  });
  after(() => fs.rmSync(directory, { recursive: true, force: true }));
  it('returns false for every non-path value', () => {
    for (const value of [
      undefined,
      null,
      {},
      { file: '/tmp' },
      [],
      ['/tmp'],
      42,
      true,
      false,
      NaN,
      () => {},
    ])
      assert.equal(exists(value), false);
  });
  it('accepts strings, buffers and file URLs', () => {
    const file = path.join(directory, 'file');
    fs.writeFileSync(file, 'data');
    for (const value of [file, Buffer.from(file), pathToFileURL(file)])
      assert.equal(exists(value), true);
    for (const value of [
      file + '-absent',
      Buffer.from(file + '-absent'),
      pathToFileURL(file + '-absent'),
    ])
      assert.equal(exists(value), false);
  });
  it('does not emit warnings for invalid values', () => {
    execFileSync(
      process.execPath,
      [
        '-e',
        `process.emitWarning = () => { throw Error('unexpected warning'); }; const {default: exists}=await import('./utils/exists-sync.ts'); for(const value of [undefined,null,{},[],42,true]) if(exists(value)!==false) throw Error('expected false')`,
      ],
      { cwd: path.join(import.meta.dirname, '..') },
    );
  });
});
