import requireValue from './require-value.ts';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Engine } from '../components/engine.ts';
import type * as Devtool from '../lib/devtool.ts';
import assert from 'node:assert/strict';
import path from 'node:path';

/** A downstream wrapper consumes only the source package's public entrypoint. */
export const createProducts = async (source: string, root: string, engine?: Engine) => {
  const entrypoint = createRequire(import.meta.url).resolve(source);
  const { createDevtool } = (await import(pathToFileURL(entrypoint).href)) as typeof Devtool;
  return ['wrapper-one', 'wrapper-two'].map((identity) =>
    createDevtool({
      identity,
      commandName: `${identity}-cli`,
      envPrefix: identity.toUpperCase().replaceAll('-', '_'),
      appFiles: ['.wrapper.yml'],
      env: {},
      engine,
      dataRoot: path.join(root, identity, 'data'),
      cacheRoot: path.join(root, identity, 'cache'),
    }),
  );
};

export const verify = async (source: string, root: string, engine?: Engine) => {
  const runtimes = await createProducts(source, root, engine);
  const apps = runtimes.map((runtime) => runtime.loadApp({ cwd: root }));
  assert.notEqual(requireValue(apps[0]).project, requireValue(apps[1]).project);
  assert.notEqual(requireValue(apps[0]).stateFile, requireValue(apps[1]).stateFile);
  assert.equal(requireValue(runtimes[0]).resolveConfig().commandName, 'wrapper-one-cli');
  await requireValue(apps[0]).start();
  assert.deepEqual(requireValue(apps[1]).state, { services: {} });
  await requireValue(apps[1]).start();
  await requireValue(apps[0]).destroy();
  const result = await requireValue(apps[1]).exec('web', ['printf', '%s', 'consumer-proof']);
  assert.equal(result.stdout, 'consumer-proof');
  await requireValue(apps[1]).stop();
  await requireValue(apps[1]).restart();
  await requireValue(apps[1]).destroy();
  return apps;
};
