import type { AppConfig, ProductOptions } from '../lib/types.ts';
import type { Engine, Volume } from '../components/engine.ts';
import type { ExecutionError } from './as-error.ts';
type Call =
  | ['compose', string[], string]
  | ['build' | 'inspect' | 'exists' | 'volume' | 'remove-volume', string | undefined];
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { App, createProductConfig } from '../lib/devtool.ts';

export const fixture = (
  services: AppConfig['services'] = {
    web: { type: 'l337', image: 'alpine:3.20', command: ['sleep', 'infinity'] },
  },
) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'devtool-test-'));
  const root = path.join(temporary, 'project');
  fs.mkdirSync(root);
  const file = path.join(root, '.devtool.yml');
  fs.writeFileSync(file, yaml.dump({ name: 'example', services }));
  const calls: Call[] = [];
  const images = new Set<string | undefined>();
  const volumes = new Map<string, Volume>();
  const engine: Engine & {
    buildError?: ExecutionError;
    commandError?: ExecutionError;
    appError?: ExecutionError;
  } = {
    async buildx(file, context) {
      calls.push(['build', context.id]);
      if (engine.buildError) throw engine.buildError;
      images.add(context.tag);
    },
    async build(file, context) {
      return engine.buildx(file, context);
    },
    getImage(tag) {
      return {
        async inspect() {
          calls.push(['inspect', tag]);
          return { Config: { Cmd: ['sleep', 'infinity'] } };
        },
      };
    },
    async listVolumes() {
      return { Volumes: [...volumes.values()] };
    },
    async createVolume(volume) {
      calls.push(['volume', volume.Name]);
      volumes.set(volume.Name, volume);
    },
    getVolume(name) {
      return {
        async remove() {
          calls.push(['remove-volume', name]);
          volumes.delete(name);
        },
      };
    },
    async imageExists(tag) {
      calls.push(['exists', tag]);
      return images.has(tag);
    },
    async compose(project, file, args) {
      calls.push(['compose', args, project]);
      if (engine.commandError || (args[0] === 'run' && engine.appError))
        throw engine.commandError ?? engine.appError;
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  const options = {
    dataRoot: path.join(temporary, 'data'),
    cacheRoot: path.join(temporary, 'cache'),
    env: {},
  };
  return {
    temporary,
    root,
    file,
    calls,
    images,
    volumes,
    engine,
    options,
    load: (overrides: ProductOptions = {}) =>
      new App({
        root,
        file,
        data: [path.basename(file)],
        config: createProductConfig({ ...options, ...overrides }),
        engine,
      }).prepare(),
    cleanup: () => fs.rmSync(temporary, { recursive: true, force: true }),
  };
};
