import path from 'node:path';

import type { ConfigSchema } from '../components/config.ts';

const string: ConfigSchema = { type: 'string' };
const product: ConfigSchema = {
  type: 'object',
  properties: {
    identity: {
      ...string,
      protected: true,
      validate(value) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(value)))
          throw new Error('Invalid product identity');
      },
    },
    commandName: { ...string, protected: true },
    envPrefix: { ...string, protected: true },
    appFiles: {
      type: 'array',
      protected: true,
      items: string,
      validate(value) {
        if (
          !(value as string[]).length ||
          (value as string[]).some((file) => path.basename(file) !== file)
        )
          throw new Error('appFiles must be a nonempty list of filenames');
      },
    },
    dataRoot: { ...string, path: true },
    cacheRoot: { ...string, path: true },
    cache: { type: 'boolean' },
    username: string,
    uid: {
      validate(value) {
        if (!['string', 'number'].includes(typeof value))
          throw new Error('uid must be a string or number');
      },
    },
    gid: {
      validate(value) {
        if (!['string', 'number'].includes(typeof value))
          throw new Error('gid must be a string or number');
      },
    },
    npmrc: {},
  },
};
const runtime: ConfigSchema = {
  type: 'object',
  properties: {
    ...product.properties,
    system: { type: 'object', protected: true, properties: product.properties },
    core: { type: 'object', properties: { engine: string, orchestrator: string } },
    'docker-engine': { type: 'object' },
    'docker-compose': { type: 'object' },
  },
};
const appDefinition: ConfigSchema = {
  type: 'object',
  properties: {
    name: string,
    config: runtime,
    services: {
      type: 'object',
      values: {
        type: 'object',
        properties: {
          type: string,
          api: { type: 'number' },
          image: {},
          primary: { type: 'boolean' },
        },
      },
    },
    networks: { type: 'object' },
    volumes: { type: 'object' },
  },
};
/** Separate ownership boundaries; service/plugin-specific validation stays with its owner. */
export default { product, runtime, appDefinition };
