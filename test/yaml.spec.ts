import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import read from '../utils/read-file.ts';
import write from '../utils/write-file.ts';

describe('YAML and file helpers', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-yaml-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  it('loads YAML objects and arrays from disk', () => {
    const file = path.join(directory, 'config.yml');
    fs.writeFileSync(file, 'obiwan: kenobi\nqui:\n- gon\n- jinn\n');
    assert.deepEqual(read(file), { obiwan: 'kenobi', qui: ['gon', 'jinn'] });
  });
  it('propagates missing YAML files to the caller', () => {
    assert.throws(() => read(path.join(directory, 'absent.yml')), /ENOENT/);
  });
  it('round-trips YAML through the file helpers', () => {
    const file = path.join(directory, 'nested', 'file.yml');
    const data = { obiwan: 'kenobi', qui: ['gon', 'jinn'] };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    write(file, data);
    assert.deepEqual(read(file), data);
  });
});
