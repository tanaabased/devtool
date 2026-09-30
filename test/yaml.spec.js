'use strict';

// Ported from Core test/yaml.spec.js at 7a87f805: native assertions and owned temporary fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Yaml = require('../lib/yaml');

describe('retained YAML and file regressions', () => {
  let directory;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-yaml-')); });
  afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));
  it('constructs the upstream logger-backed YAML helper', () => assert.ok(new Yaml().log));
  it('loads YAML objects and arrays from disk', () => {
    const file = path.join(directory, 'config.yml');
    fs.writeFileSync(file, 'obiwan: kenobi\nqui:\n- gon\n- jinn\n');
    assert.deepEqual(new Yaml().load(file), {obiwan: 'kenobi', qui: ['gon', 'jinn']});
  });
  it('reports a missing YAML file through the configured logger', () => {
    const yaml = new Yaml({error: () => { throw new Error('missing'); }});
    assert.throws(() => yaml.load(path.join(directory, 'absent.yml')), /missing/);
  });
  it('creates parent directories, returns the file and round-trips YAML', () => {
    const yaml = new Yaml(); const file = path.join(directory, 'nested', 'file.yml');
    const data = {obiwan: 'kenobi', qui: ['gon', 'jinn']};
    assert.equal(yaml.dump(file, data), file);
    assert.deepEqual(yaml.load(file), data);
  });
});
