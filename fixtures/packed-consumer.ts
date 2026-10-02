import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Config, configSchemas, createDevtool, version } from '@tanaab/devtool';
import type { Engine, ProductOptions } from '@tanaab/devtool';

const sources: string[] = [];
const engine: Engine = {
  async build(_file, options) {
    sources.push(...(options.sources ?? []).map((item) => item.source));
  },
  async buildx(file, options) {
    return engine.build(file, options);
  },
  async imageExists() {
    return false;
  },
  getImage() {
    return {
      async inspect() {
        return { Config: { Cmd: ['sleep', 'infinity'] } };
      },
    };
  },
  async compose() {
    return { code: 0, stdout: 'packed-consumer', stderr: '' };
  },
  async listVolumes() {
    return { Volumes: [] };
  },
  async createVolume() {},
  getVolume() {
    return { async remove() {} };
  },
};
const options = {
  cache: false,
  engine,
  env: {},
  dataRoot: path.resolve('data'),
  cacheRoot: path.resolve('cache'),
} satisfies ProductOptions;
const first = createDevtool({ ...options, identity: 'first' });
const second = createDevtool({ ...options, identity: 'second' });
assert.equal(fs.existsSync(options.dataRoot), false);
const apps = [first, second].map((runtime) => runtime.loadApp());
const [firstApp, secondApp] = apps;
assert.ok(firstApp && secondApp);
assert.notEqual(firstApp.project, secondApp.project);
assert.notEqual(firstApp.stateFile, secondApp.stateFile);
await firstApp.start();
assert.deepEqual(secondApp.state, { services: {} });
await secondApp.start();
await firstApp.destroy();
assert.equal((await secondApp.exec('web', ['echo', 'proof'])).stdout, 'packed-consumer');
await secondApp.destroy();
const installed = path.resolve('node_modules/@tanaab/devtool');
for (const name of ['boot.sh', 'entrypoint.sh', 'exec.sh', 'add-user.sh']) {
  const source = sources.find((source) => path.basename(source) === name);
  assert.ok(source, `${name} must be present`);
  assert.ok(
    source.startsWith(installed + path.sep),
    `${name} must come from the installed package`,
  );
  assert.ok(fs.statSync(source).isFile());
}
process.stdout.write(`packed library ${version} passed\n`);

// Exercise the public Config export through the exact installed tarball.
const settings = Config.from(
  { 'command-name': 'packed', cache: false },
  { schema: configSchemas.product },
);
const snapshot = settings.compile();
assert.equal(settings.get('commandName'), 'packed');
assert.equal(settings.get('cache'), false);
assert.match(settings.export('yaml'), /command-name: packed/);
assert.equal(settings.compile(), snapshot);
fs.writeFileSync('native.mjs', 'export default { commandName: "native" };');
const native = new Config({
  schema: configSchemas.product,
  sources: [{ id: 'native', kind: 'file', file: 'native.mjs' }],
});
native.compile();
assert.equal(native.get('commandName'), 'native');
