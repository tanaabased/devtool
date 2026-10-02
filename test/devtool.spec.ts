import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('library import', () => {
  it('leaves consumers and the host untouched', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-import-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(import.meta.dirname, '../fixtures/import-probe.ts'),
          path.resolve(import.meta.dirname, '..'),
        ],
        {
          cwd: temporary,
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, DOCKER_HOST: 'unix:///nonexistent-devtool-test.sock' },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), 'import stayed inert; consumer continued');
      assert.deepEqual(fs.readdirSync(temporary), []);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});
