import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Config, configSchemas, type ConfigSchema } from '../lib/devtool.ts';
import { ImportObject } from '../lib/yaml.ts';

const schema: ConfigSchema = {
  type: 'object',
  properties: {
    'command-name': { type: 'string' },
    'docker-engine': { type: 'object', properties: { socketPath: { type: 'string' } } },
    services: {
      type: 'object',
      values: {
        type: 'object',
        properties: {
          'app-mount': { type: 'string' },
          environment: { type: 'object' },
          labels: { type: 'object' },
        },
      },
    },
  },
};

describe('Config foundation (#31)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-config-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file: string, contents: string) => fs.writeFileSync(file, contents);

  it('normalizes objects/files/Config inputs and exports declared keys in kebab-case', () => {
    const values = {
      commandName: 'native',
      dockerEngine: { socketPath: 'socket' },
      services: {
        'web-api': {
          appMount: '/app',
          environment: { SOME_KEY: 'yes' },
          labels: { 'my-label': 'value' },
        },
      },
    };
    const object = Config.from(values, { schema, root });
    object.compile();
    write(path.join(root, 'arbitrary'), object.export('yaml'));
    const file = new Config({
      schema,
      root,
      sources: [{ id: 'custom', kind: 'file', file: 'arbitrary', format: 'yaml' }],
    });
    assert.deepEqual(file.compile().values, object.get());
    const copy = Config.from(file);
    assert.deepEqual(copy.compile().values, object.get());
    assert.equal(copy.explain('commandName').winner?.source, 'custom');
    assert.match(file.export('json'), /"socket-path"/);
    assert.match(file.export('yaml'), /app-mount:/);
    assert.equal(file.get(['services', 'web-api', 'environment', 'SOME_KEY']), 'yes');
    assert.equal(file.get(['services', 'web-api', 'labels', 'my-label']), 'value');
    assert.throws(
      () => Config.from({ commandName: 'one', 'command-name': 'two' }, { schema }).compile(),
      /ambiguous key/,
    );
  });

  it('preserves product source order when an app overlay is inserted below env/caller', () => {
    const product = new Config({
      schema: configSchemas.runtime,
      sources: [
        {
          id: 'defaults',
          kind: 'object',
          role: 'defaults',
          data: { cache: true, nested: { one: 1, two: 2 }, list: [1, 2], nil: 'old' },
        },
        {
          id: 'global',
          kind: 'object',
          role: 'global',
          data: { cache: false, nested: { one: 0 }, list: [], nil: null },
        },
        {
          id: 'environment',
          kind: 'environment',
          prefix: 'WRAPPER',
          values: { WRAPPER_CACHE: 'true' },
          fields: { CACHE: { path: 'cache', parse: (v) => v === 'true' } },
        },
        { id: 'caller', kind: 'object', role: 'caller', data: { cache: false } },
      ],
    });
    product.compile();
    const app = product
      .fork()
      .addSource(
        { id: 'app', kind: 'object', role: 'app', data: { cache: true, nested: { three: 3 } } },
        { before: 'environment' },
      );
    app.compile();
    assert.equal(app.get('cache'), false);
    assert.deepEqual(app.get('nested'), { one: 0, two: 2, three: 3 });
    assert.deepEqual(app.get('list'), []);
    assert.equal(app.get('nil'), null);
    assert.deepEqual(
      app.explain('cache').contributors.map((item) => item.source),
      ['defaults', 'global', 'app', 'environment', 'caller'],
    );
    assert.deepEqual(product.get('nested'), { one: 0, two: 2 });
    app.removeSource('caller').compile();
    assert.equal(app.explain('cache').winner?.source, 'environment');
    assert.throws(
      () =>
        product
          .fork()
          .addSource({
            id: 'app',
            kind: 'object',
            role: 'app',
            data: { system: { identity: 'other' } },
          })
          .compile(),
      /protected/,
    );
    assert.throws(
      () =>
        product
          .fork()
          .addSource({
            id: 'app',
            kind: 'object',
            role: 'app',
            data: { 'app-files': ['other.yml'] },
          })
          .compile(),
      /protected/,
    );
  });

  it('captures environment and caller data; stable snapshots survive explicit edits', () => {
    let validations = 0;
    const values = { WRAPPER_VALUE: 'original' };
    const input = { nested: { number: 0 } };
    const config = new Config({
      schema: {
        validate() {
          validations++;
        },
      },
      sources: [
        { id: 'input', kind: 'object', data: input },
        {
          id: 'env',
          kind: 'environment',
          prefix: 'WRAPPER',
          values,
          fields: { VALUE: { path: 'value' } },
        },
      ],
    });
    values.WRAPPER_VALUE = 'changed';
    input.nested.number = 99;
    assert.throws(() => config.get(), /compile/);
    const snapshot = config.compile();
    for (let i = 0; i < 100; i++) {
      assert.equal(config.get('value'), 'original');
      assert.equal(config.compile(), snapshot);
    }
    assert.equal(validations, 1);
    assert.deepEqual(config.get('nested'), { number: 0 });
    assert.equal(Reflect.set(config.get('nested') as object, 'number', 3), false);
    config.replaceSource('input', { id: 'input', kind: 'object', data: { nested: { number: 1 } } });
    assert.throws(() => config.get(), /compile/);
    config.compile();
    assert.deepEqual(snapshot.values.nested, { number: 0 });
    assert.equal(validations, 2);
  });

  it('loads files once, retains documents and reloads imports only explicitly', () => {
    const imported = path.join(root, 'service.yml');
    const file = path.join(root, 'custom.yml');
    write(imported, 'image: alpine\n');
    write(
      file,
      '# keep this comment\nshared: &shared { hello: world }\ncopy: *shared\nservices:\n  web: !import service.yml\n',
    );
    const config = new Config({
      root,
      sources: [{ id: 'app', kind: 'file', file, writable: true }],
    });
    const snapshot = config.compile();
    const document = config.sourceDocument('app')!;
    assert.match(String(document), /# keep this comment/);
    assert.match(String(document), /&shared/);
    assert.match(String(document), /\*shared/);
    assert.match(String(document), /!import service.yml/);
    document.set('added', 'local-only');
    const tagged = document.getIn(['services', 'web']) as Record<string, unknown>;
    tagged.image = 'changed-document';
    assert.equal(
      (config.sourceDocument('app')!.getIn(['services', 'web']) as Record<string, unknown>).image,
      'alpine',
    );
    assert.doesNotMatch(String(config.sourceDocument('app')), /added/);
    assert.equal(
      config.explain('services.web.image').winner?.importedFrom,
      fs.realpathSync(imported),
    );
    write(imported, 'image: changed\n');
    assert.equal(config.get('services.web.image'), 'alpine');
    const old = config.fork();
    config.reloadSource('app').compile();
    assert.equal(config.get('services.web.image'), 'changed');
    assert.equal(old.compile().values.services !== undefined, true);
    assert.equal(old.get('services.web.image'), 'alpine');
    assert.equal((snapshot.values.services as { web: { image: string } }).web.image, 'alpine');
    fs.unlinkSync(file);
    assert.equal(config.get('services.web.image'), 'changed');
    assert.throws(() => config.reloadSource('app').compile(), /app.*ENOENT/);
    assert.deepEqual(config.sources[0]?.dependencies, []);
  });

  it('supports explicit ESM and CommonJS objects without mutating module exports', () => {
    write(
      path.join(root, 'native.mjs'),
      'export default { commandName: "esm", nested: { count: 1 } };',
    );
    write(path.join(root, 'legacy.cjs'), 'module.exports = { commandName: "cjs" };');
    const config = new Config({
      root,
      schema,
      sources: [{ id: 'js', kind: 'file', file: 'native.mjs', writable: true }],
    });
    config.compile();
    assert.equal(config.get('commandName'), 'esm');
    write(path.join(root, 'native.mjs'), 'export default { commandName: "reloaded" };');
    config.reloadSource('js').compile();
    assert.equal(config.get('commandName'), 'reloaded');
    assert.equal(config.sources[0]?.writable, false);
    assert.equal(config.sourceDocument('js'), undefined);
    assert.match(config.export('json'), /"command-name"/);
    config.replaceSource('js', { id: 'js', kind: 'file', file: 'legacy.cjs' }).compile();
    assert.equal(config.get('commandName'), 'cjs');
  });

  it('retains imported arrays and round-trips their source tags', () => {
    write(path.join(root, 'values.json'), '[false,0,null]');
    write(path.join(root, 'array.yml'), 'values: !import values.json\n');
    const config = new Config({
      root,
      sources: [{ id: 'array', kind: 'file', file: 'array.yml' }],
    });
    config.compile();
    assert.deepEqual(Array.from(config.get('values') as unknown[]), [false, 0, null]);
    assert.match(String(config.sourceDocument('array')), /!import values.json/);
    assert.deepEqual(JSON.parse(config.export('json')), { values: [false, 0, null] });
  });

  it('reports missing, malformed, cyclic and non-object inputs with sources', () => {
    const file = path.join(root, 'bad.yml');
    const config = new Config({ sources: [{ id: 'bad', kind: 'file', file, optional: true }] });
    assert.deepEqual(config.compile().values, {});
    write(file, 'bad: [');
    assert.throws(() => config.reloadSource('bad').compile(), /bad.*bad.yml/);
    write(file, 'loop: !import bad.yml\n');
    assert.throws(() => config.reloadSource('bad').compile(), /Import cycle/);
    write(file, 'value: !import missing.yml\n');
    assert.throws(() => config.reloadSource('bad').compile(), /cannot resolve import/);
    write(file, '- not-an-object\n');
    assert.throws(() => config.reloadSource('bad').compile(), /must contain an object/);
    const input: Record<string, unknown> = {};
    input.loop = input;
    assert.throws(() => Config.from(input).compile(), /cyclic/);
  });

  it('isolates tagged caller objects and resolves declared source paths', () => {
    const input = new ImportObject(
      { nested: { value: 1 } },
      { file: '/original.yml', raw: 'original.yml' },
    );
    const config = Config.from({ imported: input });
    (input as ImportObject & { nested: { value: number } }).nested.value = 2;
    config.compile();
    assert.equal(config.get('imported.nested.value'), 1);
    write(path.join(root, 'paths.yml'), 'data-root: ./data\nmetadata: ./literal\n');
    const paths = new Config({
      schema: configSchemas.product,
      sources: [{ id: 'paths', kind: 'file', file: path.join(root, 'paths.yml') }],
    });
    paths.compile();
    assert.equal(paths.get('dataRoot'), path.join(root, 'data'));
    assert.equal(paths.get('metadata'), './literal');
  });
});
