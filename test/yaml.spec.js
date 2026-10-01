'use strict';

// Ported from Core test/yaml.spec.js at 7a87f805: native assertions and owned temporary fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const read = require('../utils/read-file');
const write = require('../utils/write-file');

describe('retained YAML and file regressions', () => {
  let directory;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-yaml-')); });
  afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));
  it('loads YAML objects and arrays from disk', () => {
    const file = path.join(directory, 'config.yml');
    fs.writeFileSync(file, 'obiwan: kenobi\nqui:\n- gon\n- jinn\n');
    assert.deepEqual(read(file), {obiwan: 'kenobi', qui: ['gon', 'jinn']});
  });
  it('propagates missing YAML files to the caller', () => {
    assert.throws(() => read(path.join(directory, 'absent.yml')), /ENOENT/);
  });
  it('round-trips YAML through the retained API 4 file helpers', () => {
    const file = path.join(directory, 'nested', 'file.yml');
    const data = {obiwan: 'kenobi', qui: ['gon', 'jinn']};
    fs.mkdirSync(path.dirname(file), {recursive: true});
    write(file, data);
    assert.deepEqual(read(file), data);
  });
});
