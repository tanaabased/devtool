import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { Config, configSchemas, createProductConfig } from '@tanaab/devtool';

const root = import.meta.dirname;
const file = path.join(root, '.results/edited/config.json');
fs.rmSync(path.dirname(file), { recursive: true, force: true });
const config = createProductConfig(
  {
    configDir: path.dirname(file),
    configFiles: { system: false, user: false },
    env: { DEVTOOL_COMMAND_NAME: 'masked' },
  },
  { root },
);
const snapshot = config.compile();
assert.throws(
  () =>
    config.writeSource('managed', [{ op: 'set', path: 'command-name', value: 'saved-example' }], {
      create: true,
    }),
  /force/,
);
const receipt = config.writeSource(
  'managed',
  [
    { op: 'set', path: 'command-name', value: 'saved-example' },
    { op: 'set', path: 'cache', value: false },
    { op: 'set', path: 'uid', value: 0 },
    { op: 'set', path: 'system.cache', value: false },
    { op: 'set', path: 'core', value: { engine: 'docker-engine', orchestrator: 'docker-compose' } },
    { op: 'set', path: 'dockerEngine', value: {} },
  ],
  { create: true, force: true },
);
assert.equal(receipt.file, file);
assert.equal(config.get('commandName'), 'masked');
assert.equal(config.explain('commandName').winner?.source, 'environment');
assert.equal(config.get('cache'), false);
assert.equal(snapshot.values.cache, true);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(data['command-name'], 'saved-example');
assert.equal(data.uid, 0);
assert.deepEqual(data['docker-engine'], {});
assert.equal(data.identity, undefined);
config.writeSource('managed', [{ op: 'delete', path: 'cache' }]);
assert.equal(config.get('cache'), true);
assert.equal(config.explain('cache').winner?.source, 'defaults');
for (const input of [
  { core: { engine: 'unknown' } },
  { 'docker-compose': [] },
  { 'docker-engine': { ignored: true } },
])
  assert.throws(() => Config.from(input, { schema: configSchemas.runtime }).compile());
assert.throws(
  () =>
    Config.from({ cache: true }).writeSource('memory', [
      { op: 'set', path: 'cache', value: false },
    ]),
  /writable JSON\/YAML/,
);
const saved = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, saved + '\n');
assert.throws(
  () => config.writeSource('managed', [{ op: 'set', path: 'cache', value: false }]),
  /changed on disk/,
);
assert.equal(fs.readFileSync(file, 'utf8'), saved + '\n');
process.stdout.write('managed writes, masking, deletion and protected settings verified\n');
