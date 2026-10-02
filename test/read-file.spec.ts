import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import read from '../utils/read-file.ts';
import yaml from '../lib/yaml.ts';

describe('utils/read-file', () => {
  it('should read JSON afresh and bound legacy data-module loading to explicit files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-esm-'));
    try {
      const file = path.join(directory, 'data.json');
      fs.writeFileSync(file, '{"first":true}');
      assert.deepEqual(read(file), { first: true });
      fs.writeFileSync(file, '{"second":true}');
      assert.deepEqual(read(file), { second: true });
      const dataModule = path.join(directory, 'data.cjs');
      fs.writeFileSync(dataModule, 'module.exports = {legacy: true};');
      assert.deepEqual(read(dataModule), { legacy: true });
      const imported = yaml.load(`value: !import ${file}`) as {
        value: { second: boolean; getMetadata(): { file: string } };
      };
      assert.equal(imported.value.second, true);
      assert.equal(imported.value.getMetadata().file, file);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
