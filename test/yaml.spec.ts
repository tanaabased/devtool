import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml, { type ImportScalar, ImportString, readDocument } from '../lib/yaml.ts';
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
  it('retains typed scalar import tags in documents and native values in ordinary reads', () => {
    for (const extension of ['json', 'yaml']) {
      for (const value of [false, true, 0, 42, null]) {
        const file = `value.${extension}`;
        fs.writeFileSync(path.join(directory, file), JSON.stringify(value));
        const source = `# preserve me\nvalue: !import ${file}\n`;
        const parsed = readDocument(source, { base: directory });
        const tagged = (parsed.value as { value: ImportScalar }).value;
        assert.equal(tagged.value, value);
        assert.equal(tagged.getMetadata().file, path.join(directory, file));
        assert.equal(String(parsed.document), source);
        assert.deepEqual(yaml.load(source, { base: directory }), { value });
        assert.equal(yaml.load(`!import ${file}`, { base: directory }), value);
        assert.match(yaml.dump(parsed.value), /!import/);
      }
    }
    fs.writeFileSync(path.join(directory, 'text.json'), '"./cache"');
    const text = yaml.load('!import text.json', { base: directory });
    assert.ok(text instanceof ImportString);
    assert.equal(String(text), './cache');
    assert.equal(text.getMetadata().file, path.join(directory, 'text.json'));
  });
  it('preserves scalar origins through nested imports and handles aliases in value reads', () => {
    fs.mkdirSync(path.join(directory, 'nested'));
    fs.writeFileSync(path.join(directory, 'nested/value.json'), 'false');
    fs.writeFileSync(path.join(directory, 'outer.yml'), '!import nested/value.json\n');
    const parsed = readDocument('flag: !import outer.yml\n', { base: directory });
    const flag = (parsed.value as { flag: ImportScalar }).flag;
    assert.equal(flag.value, false);
    assert.equal(
      flag.getMetadata().file,
      fs.realpathSync(path.join(directory, 'nested/value.json')),
    );
    assert.equal(String(parsed.document), 'flag: !import outer.yml\n');
    const result = yaml.load('root: &root\n  flag: !load outer.yml\n  self: *root\n', {
      base: directory,
    }) as { root: { flag: boolean; self: unknown } };
    assert.equal(result.root.flag, false);
    assert.equal(result.root.self, result.root);
    fs.writeFileSync(path.join(directory, 'nested/value.json'), '"./cache"');
    const text = readDocument('path: !import outer.yml\n', { base: directory });
    const imported = (text.value as { path: ImportString }).path;
    assert.equal(String(imported), './cache');
    assert.equal(imported.getMetadata().file, flag.getMetadata().file);
    assert.equal(String(text.document), 'path: !import outer.yml\n');
  });
});
