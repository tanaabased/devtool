'use strict';
// Ported from Core test/exists-sync.spec.js at 7a87f805, with owned temporary paths.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const exists = require('../utils/exists-sync');

describe('exists-sync upstream regressions', () => {
  let directory;
  before(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-exists-')); });
  after(() => fs.rmSync(directory, {recursive: true, force: true}));
  it('returns false for every non-path value', () => {
    for (const value of [undefined, null, {}, {file: '/tmp'}, [], ['/tmp'], 42, true, false, NaN, () => {}]) assert.equal(exists(value), false);
  });
  it('accepts strings, buffers and file URLs', () => {
    const file = path.join(directory, 'file'); fs.writeFileSync(file, 'data');
    for (const value of [file, Buffer.from(file), pathToFileURL(file)]) assert.equal(exists(value), true);
    for (const value of [file + '-absent', Buffer.from(file + '-absent'), pathToFileURL(file + '-absent')]) assert.equal(exists(value), false);
  });
  it('does not emit warnings for invalid values', () => {
    execFileSync(process.execPath, ['-e', `process.emitWarning = () => { throw Error('unexpected warning'); }; const exists=require('./utils/exists-sync'); for(const value of [undefined,null,{},[],42,true]) if(exists(value)!==false) throw Error('expected false')`], {cwd: path.join(__dirname, '..')});
  });
});
