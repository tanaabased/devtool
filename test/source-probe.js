import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';

import inventory from '../extraction.json' with { type: 'json' };

const mode = process.argv[2];
const forbid = () => { throw new Error('library import attempted a host side effect'); };
for (const method of ['writeFileSync', 'writeFile', 'mkdirSync', 'mkdir', 'rmSync', 'rm', 'unlinkSync', 'unlink']) {
  fs[method] = forbid;
  if (fs.promises[method]) fs.promises[method] = forbid;
}
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[method] = forbid;
}
net.connect = net.createConnection = http.request = https.request = forbid;
globalThis.fetch = forbid;
process.exit = forbid;
syncBuiltinESMExports();

process.argv.push('--version', '--unknown-consumer-option');
const argv = [...process.argv];
const exitCode = process.exitCode;
const listenerLimit = EventEmitter.defaultMaxListeners;
const require = createRequire(import.meta.url);
const library = await import('@tanaab/devtool');

assert.equal(library.name, 'devtool');
assert.equal(library.version, require('../package.json').version);
assert.equal(typeof library.loadCore, 'function');
assert.deepEqual(process.argv, argv);
assert.equal(process.exitCode, exitCode);
assert.equal(EventEmitter.defaultMaxListeners, listenerLimit);
assert.equal(Object.keys(require.cache).some(file => file.includes('/vendor/core/')), false);
if (mode === 'core') {
  const { L337, DockerEngine, lando } = library.loadCore();
  assert.equal(typeof L337, 'function');
  assert.equal(typeof DockerEngine, 'function');
  assert.equal(lando.api, 4);
  assert.equal(lando.parent, 'l337');
  assert.equal(typeof lando.builder, 'function');
  for (const { path } of inventory.files.filter(file => file.path.endsWith('.js'))) {
    require(`../${path}`);
  }
  console.log('retained source modules loaded without host initialization');
} else {
  assert.equal(mode, 'import');
  console.log('import stayed inert; consumer continued');
}
