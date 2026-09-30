import { createRequire } from 'node:module';

import metadata from '../package.json' with { type: 'json' };

const require = createRequire(import.meta.url);

export const name = 'devtool';
export const version = metadata.version;

/** Load the unadapted Core modules explicitly; this does not initialize an app or run Docker. */
export function loadCore() {
  return {
    L337: require('../vendor/core/components/l337-v4.js'),
    DockerEngine: require('../vendor/core/components/docker-engine.js'),
    lando: require('../vendor/core/builders/lando-v4.js'),
  };
}
