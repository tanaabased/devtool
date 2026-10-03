import type { ProductOptions } from './types.ts';
import Runtime from './runtime.ts';
import metadata from '../package.json';

/** Create an inert, independently configured runtime. loadApp performs explicit I/O. */
export const createDevtool = (options: ProductOptions = {}) => new Runtime(options);
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
export type { default as Runtime } from './runtime.ts';
export type { default as App } from './app.ts';

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
