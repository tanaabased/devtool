import assert from 'node:assert/strict';
import path from 'node:path';

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

const scalars = new Config({
  root: import.meta.dirname,
  schema: {
    properties: {
      enabled: { type: 'boolean' },
      count: { type: 'number' },
      optional: { type: 'string', nullable: true },
      cachePath: { type: 'string', path: true },
    },
  },
  sources: [{ id: 'imports', kind: 'file', file: 'scalars.yml' }],
});
scalars.compile();
const expected = {
  enabled: false,
  count: 0,
  optional: null,
  cachePath: path.join(import.meta.dirname, '.results/cache'),
};
assert.deepEqual(scalars.get(), expected);
assert.deepEqual(JSON.parse(scalars.export('json')), {
  enabled: false,
  count: 0,
  optional: null,
  'cache-path': expected.cachePath,
});
assert.match(scalars.export('yaml'), /enabled: false\ncount: 0\noptional: null/);
assert.equal(
  scalars.explain('enabled').winner?.importedFrom,
  path.join(import.meta.dirname, 'disabled.json'),
);
const source = scalars.sourceDocument('imports');
assert.ok(source);
assert.match(String(source), /# Imported values retain their native types./);
assert.match(String(source), /count: !load zero.yml/);
assert.match(String(source), /cache-path: !import cache-path.json/);
source.delete('enabled');
assert.match(String(scalars.sourceDocument('imports')), /enabled: !import disabled.json/);
assert.equal(scalars.get('enabled'), false);
assert.deepEqual(scalars.fork().compile().values, expected);
process.stdout.write('Imported scalar types, paths and source documents passed\n');
