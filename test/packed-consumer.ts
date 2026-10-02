import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDevtool, version } from '@tanaab/devtool';
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
assert.notEqual(apps[0].project, apps[1].project);
assert.notEqual(apps[0].stateFile, apps[1].stateFile);
await apps[0].start();
assert.deepEqual(apps[1].state, { services: {} });
await apps[1].start();
await apps[0].destroy();
assert.equal((await apps[1].exec('web', ['echo', 'proof'])).stdout, 'packed-consumer');
await apps[1].destroy();
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
