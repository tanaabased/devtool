import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import createProductConfig from '../lib/product-config.ts';
import seedConfigFile from '../lib/seed-config-file.ts';
import configSchemas from '../lib/config-schemas.ts';

describe('product source assembly', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-config-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('orders sources around the app insertion point and retains each winner', () => {
    for (const name of ['system', 'managed', 'user', 'explicit'])
      fs.writeFileSync(path.join(root, `${name}.json`), JSON.stringify({ commandName: name }));
    const config = createProductConfig(
      {
        configFiles: { system: 'system.json', managed: 'managed.json', user: 'user.json' },
        configFile: 'explicit.json',
        commandName: 'caller',
      },
      { root, home: root, env: { DEVTOOL_COMMAND_NAME: 'environment' } },
    );
    config.addSource(
      { id: 'app', kind: 'object', role: 'app', data: { cache: false } },
      { before: 'environment' },
    );
    assert.deepEqual(
      config.sources.map(({ id }) => id),
      ['defaults', 'system', 'managed', 'user', 'app', 'environment', 'explicit', 'caller'],
    );
    for (const winner of [
      'caller',
      'explicit',
      'environment',
      'user',
      'managed',
      'system',
      'defaults',
    ]) {
      config.compile();
      assert.equal(config.explain('commandName').winner?.source, winner);
      config.removeSource(winner);
    }
  });

  it('resolves file defaults from their source and object defaults from explicit context', () => {
    fs.mkdirSync(path.join(root, 'templates'));
    fs.writeFileSync(
      path.join(root, 'templates', 'seed.yaml'),
      'data-root: ./data\ncache: false\n',
    );
    const files = { system: false, managed: false, user: false } as const;
    const config = createProductConfig(
      { defaults: 'templates/seed.yaml', configFiles: files },
      { root, home: root, env: {} },
    );
    config.compile();
    assert.equal(config.get('dataRoot'), path.join(root, 'templates', 'data'));
    assert.equal(config.get('cache'), false);
    assert.equal(
      config.explain('dataRoot').winner?.file,
      path.join(root, 'templates', 'seed.yaml'),
    );
    const generated = createProductConfig(
      { defaults: ({ identity }) => ({ username: identity, cache: false }), configFiles: files },
      { root, home: root, env: {} },
    );
    generated.compile();
    assert.equal(generated.get('username'), 'devtool');
    assert.equal(generated.get('cache'), false);
  });

  it('rejects discovery fields from every product source, including shadowed and nested values', () => {
    const fields = [
      'appFile',
      'app-file',
      'appFiles',
      'app-files',
      'preFiles',
      'pre-files',
      'postFiles',
      'post-files',
    ];
    for (const key of fields) {
      for (const data of [{ [key]: null }, { system: { [key]: [] } }]) {
        const config = createProductConfig(
          { configFiles: { system: false, managed: false, user: false } },
          { root, home: root, env: {} },
        );
        config.addSource({ id: 'invalid', kind: 'object', data });
        config.addSource({ id: 'mask', kind: 'object', data: { system: false } });
        assert.throws(() => config.compile(), /read-only.*constructing the CLI/);
      }
    }
    const file = path.join(root, 'invalid.yaml');
    fs.writeFileSync(file, 'system:\n  cli:\n    app-file: other\n');
    for (const options of [
      { configFile: file },
      { configFiles: { system: file } },
      { configFiles: { managed: file } },
      { configFiles: { user: file } },
    ])
      assert.throws(
        () => createProductConfig(options, { root, home: root, env: {} }).compile(),
        /read-only/,
      );
  });

  it('does not create optional files and fails on a missing explicit file', () => {
    const context = { root, home: root, env: { WRAPPER_CONFIG_DIR: 'settings' } };
    const config = createProductConfig(
      { identity: 'wrapper', configFiles: { system: false } },
      context,
    );
    config.compile();
    assert.deepEqual(fs.readdirSync(root), []);
    assert.equal(
      config.sources.find(({ id }) => id === 'managed')?.file,
      path.join(root, 'settings', 'config.json'),
    );
    assert.equal(config.sources.find(({ id }) => id === 'user')?.writable, false);
    assert.throws(
      () => createProductConfig({ configFile: 'missing.yaml' }, context).compile(),
      /missing.yaml/,
    );
  });
});

describe('explicit configuration seeding', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-seed-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('publishes validated seed values and never reevaluates a template for an existing file', () => {
    const options = { root, context: { name: 'seeded' }, schema: configSchemas.product };
    assert.equal(
      seedConfigFile(
        'config.json',
        ({ name }) => ({ commandName: name, cache: false, uid: 0 }),
        options,
      ),
      true,
    );
    const data = fs.readFileSync(path.join(root, 'config.json'), 'utf8');
    assert.deepEqual(JSON.parse(data), { 'command-name': 'seeded', cache: false, uid: 0 });
    assert.equal(
      seedConfigFile(
        'config.json',
        () => {
          throw new Error('should not run');
        },
        options,
      ),
      false,
    );
    assert.equal(fs.readFileSync(path.join(root, 'config.json'), 'utf8'), data);
    assert.deepEqual(fs.readdirSync(root), ['config.json']);
  });
  it('validates before creating directories and preserves a competing initializer', () => {
    const options = { root, context: {}, schema: configSchemas.product };
    assert.throws(
      () => seedConfigFile('new/config.json', { cache: 'invalid' }, options),
      /boolean/,
    );
    assert.deepEqual(fs.readdirSync(root), []);
    assert.equal(
      seedConfigFile(
        'config.yaml',
        () => {
          fs.writeFileSync(path.join(root, 'config.yaml'), 'cache: false\n');
          return { cache: true };
        },
        options,
      ),
      false,
    );
    assert.equal(fs.readFileSync(path.join(root, 'config.yaml'), 'utf8'), 'cache: false\n');
    assert.deepEqual(fs.readdirSync(root), ['config.yaml']);
  });
});
