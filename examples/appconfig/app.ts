import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { App, Config, createProductConfig, type AppConfig } from '@tanaab/devtool';

const root = import.meta.dirname;
fs.rmSync(path.join(root, '.results'), { recursive: true, force: true });
const product = createProductConfig(
  { configFiles: { system: false, managed: false, user: false }, env: {} },
  { root },
);
const input: AppConfig = {
  services: { web: { type: 'l337', image: 'alpine:3.20' } },
  config: { cache: false },
};
const raw = new App({ root, data: input, config: product });
const source = Config.from<AppConfig>(input, { root });
const configured = new App({ root, data: source, config: product });
assert.deepEqual(raw.getMetadata(), configured.getMetadata());
assert.equal(raw.file, undefined);
input.services.web!.image = 'changed';
assert.equal(raw.data.services.web!.image, 'alpine:3.20');
assert.throws(() => new App({ root: '', data: input }), /explicit root/);

const layered = new App({ root, data: ['application.yaml', 'overlay.json'], config: product });
assert.equal(layered.config.uid, 42);
assert.equal(layered.config.cache, false);
assert.equal(layered.config.dataRoot, path.join(root, '.results/data'));
assert.equal(layered.settings.explain('uid').winner?.source, 'app:app-1');
assert.equal(
  product.sources.some(({ role }) => role === 'app'),
  false,
);
assert.equal(
  layered.definition.explain(['services', 'web', 'image', 'imagefile']).winner?.importedFrom,
  path.join(root, 'service/Dockerfile'),
);
assert.equal(
  (layered.getMetadata().definition.tooling!.hello as { cmd: string }).cmd,
  'echo overridden',
);
assert.equal(layered.services.length, 0);
assert.equal(fs.existsSync(path.join(root, '.results')), false);
const environment = createProductConfig(
  { configFiles: { system: false, managed: false, user: false }, env: { DEVTOOL_CACHE: 'true' } },
  { root },
);
assert.equal(new App({ root, data: ['application.yaml'], config: environment }).config.cache, true);
assert.throws(
  () => new App({ root, data: { ...input, config: { identity: 'forbidden' } }, config: product }),
  /protected setting/,
);

// Config stays editable; an initialized App remains bound to its original snapshot.
layered.definition.replaceSource('app-1', {
  id: 'app-1',
  kind: 'object',
  data: { config: { uid: 99 } },
});
layered.definition.compile();
assert.equal(layered.config.uid, 42);
layered.prepare();
const first = layered.services[0];
const fragments = layered.composeData.length;
layered.prepare();
assert.equal(layered.services[0], first);
assert.equal(layered.composeData.length, fragments);
const compose = layered.assemble();
assert.deepEqual(compose.services!.web!.volumes, [
  {
    source: path.join(root, 'service/content'),
    target: '/content',
    type: 'bind',
    bind: { create_host_path: false },
  },
]);
const build = first!.generateBuildContext();
assert.match(fs.readFileSync(build.imagefile, 'utf8'), /COPY content \/content/);
assert.ok(build.sources.some(({ source }) => source === path.join(root, 'service')));
process.stdout.write('explicit inputs, source provenance and deferred preparation verified\n');
