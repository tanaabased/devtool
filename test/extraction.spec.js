'use strict';
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const {createRequire, isBuiltin} = require('node:module');
const path = require('node:path');
const inventory = require('../extraction.json');
const metadata = require('../package.json');

describe('extraction provenance', () => {
  it('preserves original bytes or records each adaptation and executable mode', () => {
    for (const file of inventory.files) {
      const location = path.join(__dirname, '..', file.path);
      const data = fs.readFileSync(location);
      const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
      assert.equal(blob, file.adaptedBlob ?? file.blob, file.path);
      if (file.adaptedBlob) assert.ok(file.adaptation, file.path);
      assert.equal(Boolean(fs.statSync(location).mode & 0o111), file.mode === '100755', file.path);
    }
    assert.equal(fs.existsSync(path.join(__dirname, '../vendor')), false);
    assert.equal(new Set(inventory.files.map(file => file.path)).size, inventory.files.length);
  });
  it('resolves all retained static and lazy requires from declared dependencies', () => {
    for (const file of inventory.files.filter(file => file.path.endsWith('.js') && !file.path.startsWith('test/'))) {
      const location = path.join(__dirname, '..', file.path);
      const resolver = createRequire(location);
      const code = fs.readFileSync(location, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n');
      for (const [, specifier] of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
        resolver.resolve(specifier);
        if (specifier.startsWith('.') || isBuiltin(specifier)) continue;
        const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        assert.ok(metadata.dependencies[name], `${file.path}: ${name}`);
      }
    }
  });
});
