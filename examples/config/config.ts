import assert from 'node:assert/strict';

import { Config, configSchemas } from '@tanaab/devtool';

const settings = new Config<{ commandName: string; cache: boolean }>({
  root: import.meta.dirname,
  schema: configSchemas.product,
  sources: [
    { id: 'defaults', kind: 'object', data: { cache: true } },
    { id: 'global', kind: 'file', file: 'product.yml' },
    { id: 'native', kind: 'file', file: 'native.mjs' },
    { id: 'caller', kind: 'object', data: { cache: false } },
  ],
});
const snapshot = settings.compile();
assert.equal(settings.get('commandName'), 'native-example');
assert.equal(settings.get('cache'), false);
assert.equal(settings.explain('commandName').winner?.source, 'native');
assert.match(settings.export('yaml'), /command-name: native-example/);
settings.removeSource('native').compile();
assert.equal(settings.get('commandName'), 'example');
assert.equal(snapshot.values.commandName, 'native-example');
process.stdout.write('Config sources, provenance, casing and snapshots passed\n');

const layered = new Config({
  sources: [
    {
      id: 'defaults',
      kind: 'object',
      data: {
        tasks: [
          { id: 'build', enabled: true },
          { id: 'test', command: 'bun test' },
        ],
      },
    },
    { id: 'app', kind: 'object', data: { tasks: [{ id: 'build', command: 'bun run build' }] } },
  ],
});
layered.compile();
assert.deepEqual(layered.get('tasks'), [
  { id: 'build', enabled: true, command: 'bun run build' },
  { id: 'test', command: 'bun test' },
]);
assert.equal(layered.explain('tasks.0.enabled').winner?.source, 'defaults');
assert.equal(layered.explain('tasks.0.command').winner?.source, 'app');
