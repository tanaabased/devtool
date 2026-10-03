import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createProductConfig, configSchemas, seedConfigFile } from '@tanaab/devtool';

const root = import.meta.dirname;
const config = createProductConfig(
  {
    configDir: 'global',
    configFiles: { system: false },
    configFile: 'product.yml',
    env: { DEVTOOL_COMMAND_NAME: 'environment' },
  },
  { root },
);
config.compile();
assert.equal(config.get('commandName'), 'example');
assert.equal(config.explain('commandName').winner?.source, 'explicit');
config.removeSource('explicit').compile();
assert.equal(config.get('commandName'), 'environment');
config.removeSource('environment').compile();
assert.equal(config.get('commandName'), 'user-example');
assert.equal(config.get('uid'), 0);
assert.equal(config.get('cache'), false);
config.removeSource('user').compile();
assert.equal(config.get('commandName'), 'managed-example');

const file = path.join(root, '.results', 'seeded', 'config.json');
fs.rmSync(path.dirname(file), { recursive: true, force: true });
assert.equal(
  seedConfigFile(file, ({ name }) => ({ commandName: name, cache: false }), {
    context: { name: 'seeded-example' },
    schema: configSchemas.product,
  }),
  true,
);
assert.equal(seedConfigFile(file, { commandName: 'wrong' }, { context: {} }), false);
const seeded = createProductConfig({
  configDir: path.dirname(file),
  configFiles: { system: false },
  env: {},
});
seeded.compile();
assert.equal(seeded.get('commandName'), 'seeded-example');
assert.equal(seeded.get('cache'), false);
process.stdout.write('Product precedence, provenance and explicit seeding passed\n');
