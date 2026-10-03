import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  App,
  Config,
  configSchemas,
  createProductConfig,
  discoverApp,
  type AppConfig,
} from '@tanaab/devtool';

const root = import.meta.dirname;
fs.mkdirSync(path.join(root, '.results'), { recursive: true });
const file = path.join(root, '.results/post.yaml');
fs.copyFileSync(path.join(root, 'layers/post.yaml'), file);
const product = createProductConfig(
  {
    configFile: 'layers/product.yaml',
    configFiles: { system: false, managed: false, user: false },
    env: {},
  },
  { root },
);
const settings = product.compile().values;
const found = discoverApp({
  cwd: path.join(root, 'service'),
  filenames: settings.appFiles,
  preFiles: settings.preFiles,
  postFiles: settings.postFiles,
});
assert.equal(found.root, root);
assert.equal(found.writeTarget, 'primary');
assert.deepEqual(
  found.sources.map(({ id }) => id),
  ['pre-0', 'primary', 'post-0', 'post-1'],
);
const definition = new Config<AppConfig>({
  root,
  schema: configSchemas.appDefinition,
  sources: found.sources.map((source) => ({ ...source, writable: source.id === 'post-1' })),
});
definition.compile();
const app = new App({ root, data: definition, config: product });
assert.equal(app.config.uid, 42);
assert.equal(app.services.length, 0);
assert.equal(app.config.cacheRoot, path.join(root, '.results/post-cache'));
assert.equal(app.settings.explain('uid').winner?.source, 'app:post-1');
assert.equal(
  app.definition.explain(['services', 'web', 'image', 'imagefile']).winner?.importedFrom,
  path.join(root, 'service/Dockerfile'),
);
const before = app.definition.snapshot();
app.definition.writeSource('post-1', [{ op: 'delete', path: 'config.uid' }]);
assert.equal(app.definition.get('config.uid'), 7);
assert.equal(app.definition.explain('config.uid').winner?.source, 'pre-0');
app.definition.writeSource('post-1', [
  { op: 'set', path: 'config.uid', value: 0 },
  { op: 'set', path: 'config.cache', value: false },
  { op: 'set', path: 'tooling.hello.cmd', value: 'echo saved' },
  { op: 'set', path: ['metadata', 'literal.key'], value: null },
]);
assert.equal(app.config.uid, 42);
assert.equal(before.values.config?.uid, 42);
assert.equal(definition.compile().values.config?.uid, 42);
assert.equal(app.services.length, 0);
const saved = fs.readFileSync(file, 'utf8');
assert.match(saved, /# Keep this comment/);
assert.match(saved, /web: !import ..\/service\/web.yaml/);
assert.match(saved, /&labels/);
assert.match(saved, /copy: \*labels/);
assert.match(saved, /cache-root: .\/post-cache/);
assert.doesNotMatch(saved, /data-root|imagefile/);
assert.throws(
  () =>
    app.definition.writeSource('post-1', [
      { op: 'set', path: 'services.web.image', value: 'alpine' },
    ]),
  /scalar or import/,
);
assert.throws(
  () =>
    app.definition.writeSource('post-1', [{ op: 'set', path: 'config.system.cache', value: true }]),
  /force/,
);
app.definition.writeSource('post-1', [{ op: 'set', path: 'config.system.cache', value: true }], {
  force: true,
});
assert.throws(
  () =>
    app.definition.writeSource(
      'post-1',
      [{ op: 'set', path: 'config.system.identity', value: 'other' }],
      { force: true },
    ),
  /supplied by an app/,
);
const reloaded = new App({
  root,
  data: found.sources
    .map(({ file }) => file)
    .filter((name) => !name.endsWith('optional-missing.yaml')),
  config: product,
});
assert.equal(reloaded.config.uid, 0);
assert.equal(reloaded.config.cache, false);
assert.equal(reloaded.config.system?.cache, true);
assert.equal(reloaded.services.length, 0);
process.stdout.write('layer order, targeted edits, imports and stable snapshots verified\n');
