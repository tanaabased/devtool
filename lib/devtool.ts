import type { ProductOptions, ProductSettings } from './types.ts';
import path from 'node:path';
import type Config from './config.ts';
import App from './app.ts';
import createProductConfig from './product-config.ts';
import discoverApp from '../utils/discover-app.ts';
import type { AppDiscoveryOptions } from '../utils/discover-app.ts';
import resolveProductConfig from '../utils/resolve-product-config.ts';
import productEnvironmentSource from '../utils/product-environment-source.ts';
import clone from '../utils/clone-config.ts';
import metadata from '../package.json';

/** Compatibility facade. Configuration, discovery and App lifecycle have independent owners. */
export const createDevtool = (options: ProductOptions = {}) => {
  const { engine, ...supplied } = options;
  const settings = clone(supplied);
  const root = path.resolve('.');
  let config: Config<ProductSettings> | undefined;
  const getConfig = () => (config ??= createProductConfig(settings, { root }));
  const identity = settings.identity ?? 'devtool';
  const envPrefix = settings.envPrefix ?? identity.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    identity,
    commandName: settings.commandName ?? identity,
    envPrefix,
    engine,
    get config() {
      return getConfig();
    },
    resolveConfig: () => resolveProductConfig(getConfig()),
    captureEnvironment: (values = settings.env ?? process.env) => {
      getConfig().replaceSource('environment', productEnvironmentSource(envPrefix, values));
    },
    loadApp: (selection: Omit<AppDiscoveryOptions, 'filenames'> = {}) => {
      const config = getConfig();
      const found = discoverApp({ ...selection, filenames: resolveProductConfig(config).appFiles });
      return new App({ ...found, data: [found.file], config, engine });
    },
  };
};
export type Devtool = ReturnType<typeof createDevtool>;
export const name = 'devtool';
export const version = metadata.version;

export type {
  ProductOptions,
  ProductConfig,
  ProductSettings,
  ProductConfigContext,
  ProductTemplateContext,
  AppConfig,
  AppInfo,
  PersistedState,
  ServiceRecord,
} from './types.ts';
export type {
  Engine,
  ExecOptions,
  ExecResult,
  BuildOptions,
  ImageInfo,
  Volume,
  VolumeInput,
} from '../components/engine.ts';
export type { ServiceConfig, ServiceInfo } from '../components/service.ts';
export type { ExecutionError } from '../utils/as-error.ts';
export { default as App } from './app.ts';
export { default as discoverApp } from '../utils/discover-app.ts';

export { default as Config } from './config.ts';
export { default as configSchemas } from './config-schemas.ts';
export { default as createProductConfig } from './product-config.ts';
export { default as seedConfigFile } from './seed-config-file.ts';
export type {
  ConfigSource,
  ConfigSchema,
  ConfigSnapshot,
  ConfigReadonly,
  ConfigOrigin,
  ConfigPath,
  SourceInfo,
  ObjectSource,
  FileSource,
  EnvironmentSource,
  ConfigTemplate,
} from '../components/config.ts';
