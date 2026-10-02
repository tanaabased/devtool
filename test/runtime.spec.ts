import requireValue from '../utils/require-value.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDevtool } from '../lib/devtool.ts';
import { fixture } from '../utils/create-test-project.ts';

describe('configurable runtime (#2)', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });
  afterEach(() => f.cleanup());
  it('applies defaults, file, environment and explicit overrides, preserving false and replacing arrays', () => {
    const configFile = path.join(f.temporary, 'product.yml');
    fs.writeFileSync(configFile, 'cache: true\ncommandName: file\nappFiles: [file.yml]\n');
    const config = createDevtool({
      configFile,
      envPrefix: 'WRAPPER',
      env: {
        WRAPPER_COMMAND_NAME: 'environment',
        WRAPPER_CACHE: 'false',
        WRAPPER_APP_FILES: 'env.yml,other.yml',
      },
      commandName: 'explicit',
      appFiles: ['chosen.yml'],
    }).resolveConfig();
    assert.equal(config.commandName, 'explicit');
    assert.equal(config.cache, false);
    assert.deepEqual(config.appFiles, ['chosen.yml']);
    assert.equal(createDevtool({ configFile, env: {} }).resolveConfig().commandName, 'file');
  });
  it('isolates products, project identities, roots and their caches', async () => {
    const first = f.load({ identity: 'first', envPrefix: 'FIRST' });
    const second = f.load({ identity: 'second', envPrefix: 'SECOND' });
    assert.notEqual(first.project, second.project);
    assert.notEqual(first.stateFile, second.stateFile);
    await first.start();
    assert.deepEqual(f.load({ identity: 'second' }).state, { services: {} });
    assert.equal(requireValue(second.services[0]).info.state.IMAGE, 'UNBUILT');
  });
  it('does not read, overwrite or remove persisted cache when caching is disabled', async () => {
    const cached = f.load();
    await cached.start();
    const previous = fs.readFileSync(cached.stateFile, 'utf8');
    const uncached = f.load({ cache: false });
    assert.deepEqual(uncached.state, { services: {} });
    await uncached.start();
    await uncached.destroy();
    assert.equal(fs.readFileSync(cached.stateFile, 'utf8'), previous);
  });
  it('rejects all unsupported services before creating generated directories', () => {
    fs.writeFileSync(
      f.file,
      'services:\n  web:\n    type: l337\n    image: alpine\n  bad:\n    type: lando\n    api: 3\n    image: alpine\n',
    );
    assert.throws(() => f.load(), /Unsupported service type/);
    assert.equal(fs.existsSync(f.options.dataRoot), false);
    assert.deepEqual(f.calls, []);
  });
  it('finds configured app filenames from a subdirectory', () => {
    fs.renameSync(f.file, path.join(f.root, 'wrapper.yml'));
    const nested = path.join(f.root, 'nested');
    fs.mkdirSync(nested);
    const app = createDevtool({ ...f.options, appFiles: ['wrapper.yml'] }).loadApp({ cwd: nested });
    assert.equal(app.root, fs.realpathSync(f.root));
  });
  it('keeps generic product YAML separate from app import tags', () => {
    const configFile = path.join(f.temporary, 'product.yml');
    fs.writeFileSync(configFile, 'dataRoot: !import somewhere');
    assert.throws(() => createDevtool({ configFile }).resolveConfig(), /tag/);
  });
});

describe('product Config snapshots (#31)', () => {
  it('captures ambient settings once and refreshes explicitly without losing sources', () => {
    const env = { DEVTOOL_COMMAND_NAME: 'first' };
    const runtime = createDevtool({ env });
    env.DEVTOOL_COMMAND_NAME = 'mutated';
    assert.equal(runtime.resolveConfig().commandName, 'first');
    runtime.captureEnvironment({ DEVTOOL_COMMAND_NAME: 'next' });
    assert.equal(runtime.resolveConfig().commandName, 'next');
    assert.deepEqual(
      runtime.config.sources.map((source) => source.id),
      ['defaults', 'environment', 'caller'],
    );
    const result = runtime.resolveConfig();
    result.appFiles.push('unwanted.yml');
    assert.equal(runtime.resolveConfig().appFiles.includes('unwanted.yml'), false);
  });
});
