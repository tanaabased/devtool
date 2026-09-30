import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

describe('lib/devtool', () => {
  for (const [mode, expected] of [
    ['import', 'import stayed inert; consumer continued'],
    ['core', 'retained source modules loaded without host initialization'],
  ]) {
    it(`should ${mode === 'import' ? 'leave library consumers untouched' : 'load every retained source module without initializing the host'}`, () => {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-source-'));
      try {
        const result = spawnSync(process.execPath, [path.join(root, 'test/source-probe.js'), mode], {
          cwd: temporary,
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, NODE_PATH: '', DOCKER_HOST: 'unix:///nonexistent-devtool-test.sock' },
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), expected);
        assert.deepEqual(fs.readdirSync(temporary), []);
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    });
  }
});
