'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('library import', () => {
  it('leaves consumers and the host untouched', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-import-'));
    try {
      const result = spawnSync(process.execPath, [path.join(__dirname, 'source-probe.js')], {
        cwd: temporary, encoding: 'utf8', timeout: 10000,
        env: {...process.env, DOCKER_HOST: 'unix:///nonexistent-devtool-test.sock'},
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), 'import stayed inert; consumer continued');
      assert.deepEqual(fs.readdirSync(temporary), []);
    } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
  });
});
