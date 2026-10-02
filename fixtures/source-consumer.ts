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
  const [firstApp, secondApp] = apps;
  assert.ok(firstApp && secondApp);
  assert.notEqual(firstApp.project, secondApp.project);
  assert.notEqual(firstApp.stateFile, secondApp.stateFile);
  assert.equal(runtimes[0]!.resolveConfig().commandName, 'wrapper-one-cli');
  await firstApp.start();
  assert.deepEqual(secondApp.state, { services: {} });
  await secondApp.start();
  await firstApp.destroy();
  const result = await secondApp.exec('web', ['printf', '%s', 'consumer-proof']);
  assert.equal(result.stdout, 'consumer-proof');
  await secondApp.stop();
  await secondApp.restart();
  await secondApp.destroy();
  return apps;
};
