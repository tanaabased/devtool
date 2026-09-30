import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';

import inventory from '../extraction.json' with { type: 'json' };
import metadata from '../package.json' with { type: 'json' };

describe('extraction', () => {
  it('should preserve the recorded upstream source bytes and executable modes', () => {
    for (const file of inventory.files) {
      const location = new URL(`../${file.path}`, import.meta.url);
      const data = fs.readFileSync(location);
      const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
      assert.equal(blob, file.blob, file.path);
      assert.equal(Boolean(fs.statSync(location).mode & 0o111), file.mode === '100755', file.path);
    }
    const retained = inventory.files.filter(file => file.path.startsWith('vendor/core/')).map(file => file.path);
    const actual = fs.readdirSync(new URL('../vendor/core/', import.meta.url), { recursive: true })
      .filter(file => fs.statSync(new URL(`../vendor/core/${file}`, import.meta.url)).isFile())
      .filter(file => file !== 'package.json')
      .map(file => `vendor/core/${file}`);
    assert.deepEqual(actual.sort(), retained.sort());
  });

  it('should declare and resolve every retained static package import directly', () => {
    for (const file of inventory.files.filter(file => file.path.endsWith('.js'))) {
      const location = new URL(`../${file.path}`, import.meta.url);
      const require = createRequire(location);
      const code = fs.readFileSync(location, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n');
      for (const [, specifier] of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
        require.resolve(specifier);
        if (specifier.startsWith('.') || isBuiltin(specifier)) continue;
        const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        assert.ok(metadata.dependencies[name], `${file.path} imports undeclared ${name}`);
      }
    }
  });
});
